import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DataTableProps } from '@alneas/appkit-react/tools/data-table';
import type { ContentItem } from '../contracts/content.js';
import type { StudioCollectionListProps } from './contracts.js';

type ReactToolsTableModule = Pick<typeof import('@alneas/appkit-react/tools/data-table'), 'DataTable'>;

async function loadReactToolsTable(): Promise<ReactToolsTableModule> {
  return import('@alneas/appkit-react/tools/data-table');
}

/** Items, selection/create callbacks and the host-rendered loading/failure list. */
export interface StudioCollectionTableProps extends StudioCollectionListProps {
  /** Visible during loading, server rendering or an optional Appkit table import failure. */
  fallback: ReactNode;
}

/**
 * Renders the public Appkit table with keyboard-accessible content links and a host fallback.
 * @param props - Content items, loading state, callbacks and fallback list.
 * @returns The fallback until the asynchronous table is ready, then the collection table.
 * @remarks Requires React/React DOM ^19.2.3 and @alneas/appkit-react/styles.
 * Use a browser bundler supporting dynamic imports. No query/data-access provider is needed.
 * The legacy component name is retained; the implementation uses public Appkit.
 * @example
 * ```tsx
 * import '@alneas/appkit-react/styles';
 * import { ReactToolsCollectionList } from '@alneas/sitekit/studio/collection-list';
 * export function List() {
 * return <ReactToolsCollectionList items={[]} loading={false}
 * onSelect={item => console.log(item.id)} onCreate={() => console.log('create')}
 * fallback={<p>Loading…</p>} />;
 * }
 * ```
 */
export function ReactToolsCollectionList(props: StudioCollectionTableProps) {
  const { items, loading, onSelect, onCreate, fallback } = props;
  const [module, setModule] = useState<ReactToolsTableModule | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadReactToolsTable()
      .then(loaded => { if (mounted) setModule(loaded); })
      .catch(() => { if (mounted) setLoadError(true); });
    return () => { mounted = false; };
  }, []);

  if (loading || !module || loadError) return <>{fallback}</>;
  const DataTable = module.DataTable;
  const columns: DataTableProps<Record<string, unknown>, unknown>['columns'] = [
    { accessorKey: 'title', header: 'タイトル', cell: ({ row }) => {
      const item = items.find(candidate => candidate.id === String(row.original.id));
      return item ? <button type="button" className="eaos-studio__open-document" onClick={event => { event.stopPropagation(); onSelect(item); }}>{item.title || item.slug || '無題'}</button> : null;
    } },
    { accessorKey: 'slug', header: 'スラッグ' },
    { accessorKey: 'status', header: '状態', cell: ({ row }) => ({ draft: '下書き', published: '公開', scheduled: '予約公開', archived: 'アーカイブ' }[String(row.original.status)] ?? '下書き') },
    { accessorKey: 'modifiedAt', header: '更新日時', cell: ({ row }) => {
      const value = new Date(String(row.original.modifiedAt ?? ''));
      return Number.isNaN(value.valueOf()) ? '—' : new Intl.DateTimeFormat('ja', { dateStyle: 'short', timeStyle: 'short' }).format(value);
    } },
  ];
  return (
    <DataTable
      testId="eaos-studio-content-table"
      data={items as unknown as Record<string, unknown>[]}
      columns={columns}
      rowIdField="id"
      variant="toolbar"
      onAdd={onCreate}
      onRowClick={(id: string | number) => {
        const item = items.find(candidate => candidate.id === String(id));
        if (item) onSelect(item);
      }}
    />
  );
}
