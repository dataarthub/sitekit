import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ContentItem } from '../contracts/content.js';
import type {
  StudioBodyEditorProps,
  StudioCollectionDefinition,
  StudioCollectionListProps,
  StudioListQuery,
  StudioMetadataEditorProps,
  StudioProvider,
} from './contracts.js';
import { ReactToolsCollectionList } from './ReactToolsCollectionList.js';

/** Host-owned persistence, collections and optional renderers for the public management screen. */
export interface BasicStudioAppProps {
  /** Stable persistence adapter; keep the same instance across host renders. */
  provider: StudioProvider;
  /** Collections the host has authorized this user to manage; this list does not enforce server access. */
  collections: readonly StudioCollectionDefinition[];
  /** Initially selected collection identifier; defaults to the first collection. */
  initialCollection?: string;
  /** Initial content locale; defaults to ja. The built-in selector exposes ja and en. */
  initialLocale?: string;
  /** Screen heading; defaults to Content Studio. */
  title?: string;
  /**
   * Optional host renderer; ordinary Markdown textarea is the default.
   * @param props - Host-supplied rendering properties.
   * @returns React output for the controlled body editor.
   * @example
   * ```ts
   * import type { BasicStudioAppProps } from '@alneas/sitekit/studio/basic';
   * export function useRenderBodyEditor(host: BasicStudioAppProps, ...args: Parameters<NonNullable<BasicStudioAppProps['renderBodyEditor']>>) {
   * return host.renderBodyEditor?.(...args);
   * }
   * ```
   */
  renderBodyEditor?: (props: StudioBodyEditorProps) => ReactNode;
  /**
   * Host list shown while the optional table loads, fails or is loading records.
   * @param props - Host-supplied rendering properties.
   * @returns React output for the host content list or fallback list.
   * @example
   * ```ts
   * import type { BasicStudioAppProps } from '@alneas/sitekit/studio/basic';
   * export function useRenderCollectionList(host: BasicStudioAppProps, ...args: Parameters<NonNullable<BasicStudioAppProps['renderCollectionList']>>) {
   * return host.renderCollectionList?.(...args);
   * }
   * ```
   */
  renderCollectionList?: (props: StudioCollectionListProps) => ReactNode;
  /**
   * Replaces the default title, slug, summary and tag fields.
   * @param props - Host-supplied rendering properties.
   * @returns React output for the host metadata fields.
   * @example
   * ```ts
   * import type { BasicStudioAppProps } from '@alneas/sitekit/studio/basic';
   * export function useRenderMetadataEditor(host: BasicStudioAppProps, ...args: Parameters<NonNullable<BasicStudioAppProps['renderMetadataEditor']>>) {
   * return host.renderMetadataEditor?.(...args);
   * }
   * ```
   */
  renderMetadataEditor?: (props: StudioMetadataEditorProps) => ReactNode;
}

const defaultDraft = (collection: StudioCollectionDefinition, locale: string): ContentItem => ({
  id: '',
  collection: collection.id,
  slug: '',
  locale,
  title: '',
  summary: '',
  body: '',
  tags: [],
  status: 'draft',
  data: {},
});

function collectionDraft(collection: StudioCollectionDefinition, locale: string): ContentItem {
  return collection.createDraft?.({
    collection: collection.id,
    locale,
    id: '',
    slug: '',
  }) ?? defaultDraft(collection, locale);
}

function statusLabel(status: ContentItem['status']): string {
  switch (status) {
    case 'published': return '公開';
    case 'scheduled': return '予約公開';
    case 'archived': return 'アーカイブ';
    default: return '下書き';
  }
}

/**
 * Renders basic content listing, search, Markdown editing, draft saving and publishing.
 *
 * @param props - Stable provider, collection definitions and optional host renderers.
 * @returns A React management screen with asynchronous provider operations and inline feedback.
 * @remarks Mount in a browser React island. Import the public Appkit stylesheet and
 * this package's studio/basic.css once. No query provider or restricted editor is required.
 * The host must enforce authentication and collection/tenant authorization on the server.
 * Saves pass modifiedAt for conflict checks; publish first saves the current draft.
 * Provider failures preserve entered content; list navigation asks before discarding edits.
 * This screen does not implement rich editing, preview rendering, deletion or revision history.
 * @example
 * ```tsx
 * import '@alneas/appkit-react/styles';
 * import '@alneas/sitekit/studio/basic.css';
 * import { BasicStudioApp } from '@alneas/sitekit/studio/basic';
 * import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';
 * const provider = createHttpStudioProvider();
 * export function Admin() {
 * return <BasicStudioApp provider={provider} collections={[{ id: 'posts', label: 'Posts' }]} />;
 * }
 * ```
 */
export function BasicStudioApp(props: BasicStudioAppProps) {
  const {
  provider,
  collections,
  initialCollection,
  initialLocale = 'ja',
  title = 'Content Studio',
  renderBodyEditor,
  renderCollectionList,
  renderMetadataEditor,
} = props;
  const firstCollection = initialCollection ?? collections[0]?.id ?? '';
  const [collectionId, setCollectionId] = useState(firstCollection);
  const [locale, setLocale] = useState(initialLocale);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const listRequest = useRef(0);
  const appliedQuery = useRef('');
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const collection = useMemo(
    () => collections.find(candidate => candidate.id === collectionId) ?? collections[0],
    [collectionId, collections],
  );

  const loadItems = async (clearMessage = true, append = false) => {
    if (!collection) return;
    const requestId = ++listRequest.current;
    setLoading(true);
    if (clearMessage) setMessage(null);
    try {
      const search = append ? appliedQuery.current : query;
      const request: StudioListQuery = {
        collection: collection.id,
        locale,
        ...(search ? { search } : {}),
        ...(append && nextCursor ? { cursor: nextCursor } : {}),
      };
      const result = await provider.list(request);
      if (requestId === listRequest.current) {
        setItems(current => append ? [...current, ...result.items] : result.items);
        setNextCursor(result.nextCursor);
        appliedQuery.current = search;
      }
    } catch (error) {
      if (requestId === listRequest.current) setMessage(error instanceof Error ? error.message : 'コンテンツの取得に失敗しました');
    } finally {
      if (requestId === listRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
    return () => { listRequest.current++; };
  }, [provider, collectionId, locale]);

  const openDocument = async (item: ContentItem) => {
    if (opening) return;
    setMessage(null);
    setOpening(true);
    try {
      const document = await provider.get(item.id);
      if (!document) throw new Error('コンテンツが見つかりません。一覧を更新してください。');
      setSelected(document);
      setDirty(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'コンテンツの取得に失敗しました');
    } finally { setOpening(false); }
  };

  const closeEditor = () => {
    setSelected(null);
    setDirty(false);
    setConfirmDiscard(false);
    setMessage(null);
  };
  const leaveEditor = () => { if (dirty) setConfirmDiscard(true); else closeEditor(); };

  const newDocument = () => {
    if (collection) { setSelected(collectionDraft(collection, locale)); setDirty(false); setConfirmDiscard(false); setMessage(null); }
  };

  const updateSelected = (patch: Partial<ContentItem>) => {
    setSelected(current => current ? { ...current, ...patch } : current);
    setDirty(true);
  };

  const save = async (publish: boolean) => {
    if (!selected || saving) return;
    if (!selected.title.trim() || !selected.slug.trim()) { setMessage('タイトルとスラッグを入力してください'); return; }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await provider.saveDraft(selected, selected.modifiedAt ? { expectedModifiedAt: selected.modifiedAt } : undefined);
      setSelected(saved);
      setDirty(false);
      setConfirmDiscard(false);
      const result = publish ? await provider.publish(saved.id) : saved;
      setSelected(result);
      setMessage(publish ? '公開しました' : '下書きを保存しました');
      await loadItems(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="eaos-studio" data-testid="eaos-studio">
      <header className="eaos-studio__header">
        <div>
          <p className="eaos-studio__eyebrow">EAOS HOST SITE</p>
          <h1>{title}</h1>
        </div>
        <div className="eaos-studio__header-actions">
          <label>
            <span className="eaos-studio__sr-only">言語</span>
            <select disabled={selected !== null || opening} value={locale} onChange={event => setLocale(event.target.value)}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </label>
          {selected && <button type="button" disabled={saving} onClick={leaveEditor}>一覧へ戻る</button>}
        </div>
      </header>

      {confirmDiscard && <div className="eaos-studio__message" role="alert">
        <p>保存していない変更があります。</p>
        <button type="button" onClick={() => setConfirmDiscard(false)}>編集を続ける</button>{' '}
        <button type="button" onClick={closeEditor}>変更を破棄して戻る</button>
      </div>}
      {opening && <p role="status">コンテンツを開いています…</p>}
      {message && <div className="eaos-studio__message" role="status">{message}</div>}

      {!selected ? (
        <main className="eaos-studio__workspace">
          <aside className="eaos-studio__sidebar">
            <h2>コレクション</h2>
            <nav aria-label="コレクション">
              {collections.map(candidate => (
                <button
                  type="button"
                  key={candidate.id}
                  className={candidate.id === collectionId ? 'is-active' : ''}
                  disabled={opening} onClick={() => setCollectionId(candidate.id)}
                >
                  {candidate.label}
                </button>
              ))}
            </nav>
          </aside>
          <section className="eaos-studio__list-panel">
            <div className="eaos-studio__panel-header">
              <div>
                <h2>{collection?.label ?? 'コンテンツ'}</h2>
                {collection?.description && <p>{collection.description}</p>}
              </div>
              <button type="button" className="eaos-studio__primary" onClick={newDocument} disabled={!collection || opening}>新規作成</button>
            </div>
            <div className="eaos-studio__toolbar">
              <input
                type="search"
                aria-label="検索"
                value={query}
                placeholder="検索"
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') void loadItems(); }}
              />
              <button type="button" onClick={() => void loadItems()} disabled={loading}>更新</button>
            </div>
            <ReactToolsCollectionList
              items={items}
              loading={loading}
              onSelect={item => void openDocument(item)}
              onCreate={newDocument}
              fallback={renderCollectionList ? renderCollectionList({
                items,
                loading,
                onSelect: item => void openDocument(item),
                onCreate: newDocument,
              }) : (
                loading ? <p>読み込み中…</p> : (
                  <div className="eaos-studio__items">
                    {items.length === 0 && <p className="eaos-studio__empty">コンテンツがありません。</p>}
                    {items.map(item => (
                      <button type="button" className="eaos-studio__item" key={item.id} onClick={() => void openDocument(item)}>
                        <span>
                          <strong>{item.title || item.slug || '無題'}</strong>
                          <small>{item.slug}</small>
                        </span>
                        <span className={`eaos-studio__status eaos-studio__status--${item.status ?? 'draft'}`}>
                          {statusLabel(item.status)}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              )}
            />
            {nextCursor && <button type="button" disabled={loading} onClick={() => void loadItems(true, true)}>さらに読み込む</button>}
          </section>
        </main>
      ) : (
        <main className="eaos-studio__editor">
          <div className="eaos-studio__editor-header">
            <div>
              <p className="eaos-studio__eyebrow">{selected.collection} / {selected.locale}</p>
              <h2>{selected.title || '新規コンテンツ'}</h2>
            </div>
            <div className="eaos-studio__editor-actions">
              <button type="button" onClick={() => void save(false)} disabled={saving}>下書き保存</button>
              <button type="button" className="eaos-studio__primary" onClick={() => void save(true)} disabled={saving}>
                公開
              </button>
            </div>
          </div>
          <div className="eaos-studio__form">
            {renderMetadataEditor ? renderMetadataEditor({
              document: selected,
              disabled: saving,
              onChange: updateSelected,
            }) : (
              <>
                <label>
                  タイトル
                  <input value={selected.title} onChange={event => updateSelected({ title: event.target.value })} disabled={saving} />
                </label>
                <label>
                  スラッグ
                  <input value={selected.slug} onChange={event => updateSelected({ slug: event.target.value })} disabled={saving} />
                </label>
                <label>
                  概要
                  <textarea value={selected.summary ?? ''} rows={3} onChange={event => updateSelected({ summary: event.target.value })} disabled={saving} />
                </label>
                <label>
                  タグ（カンマ区切り）
                  <input value={selected.tags.join(', ')} onChange={event => updateSelected({ tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} disabled={saving} />
                </label>
              </>
            )}
            <div className="eaos-studio__body-field">
              <span>本文</span>
              {renderBodyEditor?.({
                value: selected.body ?? '',
                disabled: saving,
                onChange: value => updateSelected({ body: value }),
              }) ?? <textarea
                aria-label="本文（Markdown）"
                rows={18}
                value={selected.body ?? ''}
                disabled={saving}
                onChange={event => updateSelected({ body: event.target.value })}
              />}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
