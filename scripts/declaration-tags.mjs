// Parse actual declaration comments; TypeDoc permits some duplicates without warning.
export function declarationTagIssues(ts,text,fileName){
 const file=ts.createSourceFile(fileName,text,ts.ScriptTarget.Latest,true),issues=[];
 for(const d of file.parseDiagnostics)issues.push({file:fileName,line:file.getLineAndCharacterOfPosition(d.start??0).line+1,tag:'syntax'});
 const seenNodes=new Set();
 function visit(node){
  for(const block of node.jsDoc??[]){
   if(seenNodes.has(block))continue;seenNodes.add(block);const seen=new Set();
   for(const tag of block.tags??[]){
    const name=tag.tagName.text;let key;
    if(['returns','return','remarks','deprecated','defaultValue'].includes(name))key=name==='return'?'returns':name;
    else if(name==='param')key='param:'+tag.name?.getText(file);
    else if(name==='typeParam'){
     const comment=typeof tag.comment==='string'?tag.comment:(tag.comment??[]).map(x=>x.text??'').join('');key='typeParam:'+comment.trim().split(/\s/)[0];
    }
    if(key){if(seen.has(key))issues.push({file:fileName,line:file.getLineAndCharacterOfPosition(tag.pos).line+1,tag:key});seen.add(key);}
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(file);return issues;
}
