// Inspect reachable public signatures only; never infer documentation from implementation bodies.
import { resolve, relative } from 'node:path';
import { Node, SyntaxKind as K } from 'ts-morph';
export function inspectPublicJsdoc({ project, root, entrypoints }) {
    const issues = [], examples = [], seen = new Set(), exampleSeen = new Set(), inferredSeen = new Set();
    const stats = { declarations: 0, members: 0, callables: 0, generics: 0 };
    const local = n => n && n.getSourceFile().getFilePath().startsWith(root + '/') && !n.getSourceFile().getFilePath().includes('/node_modules/');
    const key = n => n.getSourceFile().getFilePath() + ':' + n.getStart();
    function issue(n, kind, label, detail = '') { issues.push({ kind, path: relative(root, n.getSourceFile().getFilePath()), line: n.getStartLineNumber(), label, detail }); }
    function documentation(n) {
        let blocks = n.getJsDocs?.() ?? [];
        if (!blocks.length && Node.isVariableDeclaration(n))
            blocks = n.getVariableStatement()?.getJsDocs() ?? [];
        let raw = blocks.map(b => b.getText()).join('\n');
        if (!raw)
            raw = n.getSourceFile().getFullText().slice(n.getFullStart(), n.getStart()).match(/\/\*\*[^]*?\*\//g)?.join('\n') ?? '';
        if (!raw)
            raw = n.getLeadingCommentRanges().map(c => c.getText()).filter(t => t.startsWith('/**')).join('\n');
        if (!raw && Node.isReturnStatement(n.getParent()))
            raw = n.getParent().getSourceFile().getFullText().slice(n.getParent().getFullStart(), n.getParent().getStart()).match(/\/\*\*[^]*?\*\//g)?.join('\n') ?? '';
        const text = raw.replace(/\/\*\*|\*\//g, '').split('\n').map(l => l.replace(/^\s*\* ?/, '')).join('\n').trim();
        const summary = text.split(/(?:^|\n)\s*@\w/)[0].trim();
        const tags = [...text.matchAll(/(?:^|\n)\s*@(\w+)\s*([^]*?)(?=(?:\n\s*@\w+)|$)/g)].map(m => ({ name: m[1], text: m[2].trim() }));
        return { summary, tags, attached: blocks.length > 0 || !n.getJsDocs || Node.isVariableDeclaration(n) || Node.isReturnStatement(n.getParent()) };
    }
    function describe(n, label, member = false) {
        const d = documentation(n);
        if (d.summary && !d.attached) issue(n, 'attachment', label, 'Place JSDoc on its own line so TypeScript preserves the member documentation.');
        if (!d.summary)
            issue(n, member ? 'member-description' : 'description', label);
        for (const tag of d.tags.filter(t => t.name === 'example')) {
            if (!tag.text || !/(?:\bimport\b|\bimport\s*\()/.test(tag.text))
                issue(n, 'example', label, 'Example must import its public API.');
            const fences = [...tag.text.matchAll(/```(typescript|tsx|ts|js)?\s*\n([^]*?)```/g)];
            const codes = fences.length ? fences.map(m => ({ code: m[2], language: m[1] })) : [{ code: tag.text, language: 'typescript' }];
            for (const snippet of codes) {
                const id = key(n) + ':' + snippet.code;
                if (!exampleSeen.has(id)) {
                    exampleSeen.add(id);
                    examples.push({ source: relative(root, n.getSourceFile().getFilePath()) + ':' + label, ...snippet });
                }
            }
        }
        return d;
    }
    function generics(n, d, label) { for (const p of n.getTypeParameters?.() ?? []) {
        type(p.getConstraint(), label);
        type(p.getDefault(), label);
        stats.generics++;
        const name = p.getName();
        if (!d.tags.some(t => t.name === 'typeParam' && new RegExp('^' + name + '\\s+(?:-\\s*)?\\S').test(t.text)))
            issue(n, 'type-param', label, name);
    } }
    function call(signature, owner, label, constructor = false, d = documentation(owner)) {
        stats.callables++;
        for (const p of signature.getParameters?.() ?? []) {
            const name = p.getName();
            if (!d.tags.some(t => t.name === 'param' && t.text.startsWith(name + ' ') && t.text.slice(name.length).replace(/^\s*-?\s*/, '').length))
                issue(owner, 'param', label, name);
        }
        if (!constructor && !d.tags.some(t => ['returns', 'return'].includes(t.name) && t.text.replace(/^-\s*/, '').trim()))
            issue(owner, 'returns', label);
        if (!d.tags.some(t => t.name === 'example' && t.text))
            issue(owner, 'example', label);
        if (signature !== owner)
            generics(signature, d, label);
    }
    function follow(n) {
        const symbol = n.getSymbol?.();
        if (!symbol)
            return;
        for (const decl of (symbol.getAliasedSymbol?.() ?? symbol).getDeclarations())
            if (local(decl) && [K.InterfaceDeclaration, K.TypeAliasDeclaration, K.ClassDeclaration, K.EnumDeclaration, K.FunctionDeclaration, K.VariableDeclaration].includes(decl.getKind()))
                visit(decl, decl.getName?.() ?? 'type');
    }
    function type(n, label) {
        if (!n)
            return;
        if (Node.isTypeReference(n)) {
            follow(n.getTypeName());
            for (const a of n.getTypeArguments())
                type(a, label);
            return;
        }
        if (Node.isTypeQuery(n)) {
            follow(n.getExprName());
            return;
        }
        if (Node.isTypeLiteral(n)) {
            for (const m of n.getMembers())
                member(m, label + '.' + (m.getName?.() ?? m.getKindName()));
            return;
        }
        if (Node.isFunctionTypeNode(n) || n.getKind() === K.ConstructorType) {
            for (const p of n.getParameters())
                type(p.getTypeNode(), label + '.' + p.getName());
            type(n.getReturnTypeNode(), label);
            return;
        }
        for (const c of n.getChildren())
            if (c.getKind() !== K.SyntaxList)
                type(c, label);
            else
                for (const child of c.getChildren())
                    type(child, label);
    }
    function inferred(t, label) {
        if (!t || inferredSeen.has(t.compilerType))
            return;
        inferredSeen.add(t.compilerType);
        for (const symbol of [t.getAliasSymbol(), t.getSymbol()])
            for (const declaration of symbol?.getDeclarations() ?? [])
                if (local(declaration) && [K.InterfaceDeclaration, K.TypeAliasDeclaration, K.ClassDeclaration].includes(declaration.getKind()))
                    visit(declaration, declaration.getName() ?? label);
        for (const part of t.isUnion() ? t.getUnionTypes() : t.isIntersection() ? t.getIntersectionTypes() : [])
            inferred(part, label);
        const promised = t.getTypeArguments?.();
        for (const arg of promised ?? [])
                inferred(arg, label);
        for (const property of t.getProperties())
            for (const declaration of property.getDeclarations()) {
                if (!local(declaration))
                    continue;
                const name = property.getName(), l = label + '.' + name;
                if ([K.PropertyAssignment, K.ShorthandPropertyAssignment, K.MethodDeclaration, K.PropertySignature, K.MethodSignature, K.GetAccessor, K.SetAccessor].includes(declaration.getKind())) {
                    member(declaration, l);
                    inferred(property.getTypeAtLocation(declaration), l);
                }
            }
        for (const signature of t.getCallSignatures()) {
            const declaration = signature.getDeclaration();
            if (local(declaration) && !seen.has(key(declaration))) {
                if (Node.isFunctionDeclaration(declaration))
                    visit(declaration, declaration.getName() ?? label);
                else if (Node.isArrowFunction(declaration) || Node.isFunctionExpression(declaration)) {
                    seen.add(key(declaration));
                    const d = describe(declaration, label, true);
                    generics(declaration, d, label);
                    call(declaration, declaration, label, false, d);
                    for (const parameter of declaration.getParameters()) type(parameter.getTypeNode(), label + '.' + parameter.getName());
                    result(declaration, label);
                }
            }
        }
    }
    function result(n, label) {
        const explicit = n.getReturnTypeNode?.();
        if (explicit)
            type(explicit, label);
        else if (n.getReturnType)
            inferred(n.getReturnType(), label);
    }
    function shape(n, label) {
        if (!n)
            return;
        if (Node.isObjectLiteralExpression(n)) {
            for (const p of n.getProperties()) {
                if (Node.isSpreadAssignment(p))
                    continue;
                const name = p.getName?.() ?? p.getKindName();
                const l = label + '.' + name;
                if (seen.has(key(p)))
                    continue;
                seen.add(key(p));
                stats.members++;
                const d = describe(p, l, true);
                generics(p, d, l);
                if (p.getParameters)
                    call(p, p, l, false, d);
                const init = p.getInitializer?.();
                if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
                    call(init, p, l, false, d);
                    for (const param of init.getParameters())
                        type(param.getTypeNode(), l + '.' + param.getName());
                    type(init.getReturnTypeNode(), l);
                }
                else
                    shape(init, l);
            }
            return;
        }
        if (Node.isCallExpression(n)) { // Inspect schema shape arguments, not factory declarations or callback bodies.
            for (const arg of n.getArguments())
                if (Node.isObjectLiteralExpression(arg))
                    shape(arg, label);
            if (Node.isPropertyAccessExpression(n.getExpression()))
                shape(n.getExpression().getExpression(), label);
        }
        else if ([K.AsExpression, K.SatisfiesExpression, K.ParenthesizedExpression, K.NonNullExpression].includes(n.getKind()))
            shape(n.getExpression(), label);
    }
    function member(n, label) {
        const overloads = n.getOverloads?.() ?? [];
        if (n.getBody?.() && overloads.length) {
            for (const overload of overloads) member(overload, label);
            return;
        }
        if (n.hasModifier?.('private') || n.hasModifier?.('protected') || n.getName?.().startsWith('#'))
            return;
        if (seen.has(key(n)))
            return;
        seen.add(key(n));
        stats.members++;
        const d = describe(n, label, true);
        generics(n, d, label);
        if (n.getParameters)
            call(n, n, label, Node.isConstructorDeclaration(n) || n.getKind() === K.ConstructSignature, d);
        const t = n.getTypeNode?.();
        if (t && (Node.isFunctionTypeNode(t) || t.getKind() === K.ConstructorType))
            call(t, n, label, t.getKind() === K.ConstructorType, d);
        if (Node.isPropertyAssignment(n)) {
            const init = n.getInitializer();
            if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
                call(init, n, label, false, d);
                for (const p of init.getParameters())
                    type(p.getTypeNode(), label + '.' + p.getName());
                result(init, label);
            }
        }
        type(t, label);
        for (const p of n.getParameters?.() ?? [])
            type(p.getTypeNode(), label + '.' + p.getName());
        if (!Node.isConstructorDeclaration(n))
            result(n, label);
    }
    function visit(n, label) {
        const path = n.getSourceFile().getFilePath();
        if (path.includes('/dist/') && path.endsWith('.d.ts')) {
            const source = path.replace('/dist/', '/src/').replace(/\.d\.ts$/, '.ts');
            const file = project.getSourceFile(source) ?? project.addSourceFileAtPathIfExists(source) ?? project.addSourceFileAtPathIfExists(source + 'x');
            const original = file?.getDescendants().find(d => d.getKind() === n.getKind() && d.getName?.() === n.getName?.());
            if (original) {
                visit(original, label);
                return;
            }
        }
        if (!local(n) || seen.has(key(n)))
            return;
        // A function's implementation is not a public overload signature.
        if (Node.isFunctionDeclaration(n)) {
            const overloads = (n.getImplementation() ?? n).getOverloads();
            if (overloads.length) {
                for (const o of overloads)
                    visitSignature(o, label);
                return;
            }
        }
        visitSignature(n, label);
    }
    function visitSignature(n, label) {
        if (seen.has(key(n)))
            return;
        seen.add(key(n));
        stats.declarations++;
        const d = describe(n, label);
        generics(n, d, label);
        if (Node.isFunctionDeclaration(n))
            call(n, n, label, false, d);
        if (Node.isClassDeclaration(n) && !d.tags.some(t => t.name === 'example'))
            issue(n, 'example', label);
        if (Node.isEnumDeclaration(n)) {
            for (const m of n.getMembers())
                member(m, label + '.' + m.getName());
        }
        if (Node.isClassDeclaration(n) || Node.isInterfaceDeclaration(n)) {
            for (const m of n.getMembers())
                member(m, label + '.' + (Node.isConstructorDeclaration(m) ? 'constructor' : m.getName?.() ?? m.getKindName()));
            for (const h of n.getHeritageClauses())
                for (const t of h.getTypeNodes())
                    follow(t.getExpression());
        }
        if (Node.isTypeAliasDeclaration(n)) {
            const t = n.getTypeNode();
            if (Node.isFunctionTypeNode(t) || t.getKind() === K.ConstructorType)
                call(t, n, label, t.getKind() === K.ConstructorType, d);
            type(t, label);
        }
        if (Node.isVariableDeclaration(n)) {
            const init = n.getInitializer();
            if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
                call(init, n, label, false, d);
                for (const p of init.getParameters())
                    type(p.getTypeNode(), label + '.' + p.getName());
                result(init, label);
            }
            else {
                shape(init, label);
                inferred(n.getType(), label);
                if (init && (Node.isIdentifier(init) || Node.isPropertyAccessExpression(init)))
                    follow(init);
            }
        }
        for (const p of n.getParameters?.() ?? [])
            type(p.getTypeNode(), label + '.' + p.getName());
        if (!Node.isConstructorDeclaration(n))
            result(n, label);
        if (!Node.isTypeAliasDeclaration(n))
            type(n.getTypeNode?.(), label);
        for (const p of n.getTypeParameters?.() ?? []) {
            type(p.getConstraint(), label);
            type(p.getDefault(), label);
        }
    }
    for (const entry of entrypoints) {
        const file = project.getSourceFile(resolve(root, entry)) ?? project.addSourceFileAtPath(resolve(root, entry));
        for (const [name, nodes] of file.getExportedDeclarations())
            for (const n of nodes)
                visit(n, n.getName?.() ?? name);
    }
    return { issues, examples, stats };
}
