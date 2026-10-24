import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConsoleReport, ConsoleReportQuery, MarketingConsoleProvider, SocialAccount, SocialJob, SocialJobAction, MarketingAccess } from './console-contracts.js';
import { zonedDateTimeToUtc } from './time.js';
import { managementErrorMessage } from './settings-screen.js';
import { parseConsoleQuery } from './console-schemas.js';

type Page = 'overview' | 'campaigns' | 'posts' | 'connections';
interface MarketingScreenProps {
  provider: MarketingConsoleProvider; initialQuery: ConsoleReportQuery; page: Page;
  onNavigate(page: Page): void; access: MarketingAccess; onDirtyChange(dirty: boolean): void;
}
const labels = { overview: '概要', campaigns: '広告効果', posts: 'SNS投稿', connections: '接続設定' };
const statusLabels: Record<SocialJob['status'], string> = { draft: '承認待ち', scheduled: '予約済み', queued: '配信待ち', publishing: '配信処理中', retry_wait: '再試行待ち', published: '公開済み', failed: '配信できませんでした', unknown: '公開状況の確認が必要', cancelled: 'キャンセル済み' };
const message = managementErrorMessage;
function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return '—';
  const formatter = new Intl.NumberFormat('ja-JP', { style: 'currency', currency });
  return formatter.format(value / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
}

/** Common marketing application. Providers change storage, never screen behavior. */
export function MarketingScreen({ provider, initialQuery, page, onNavigate: setPage, access, onDirtyChange }: MarketingScreenProps) {
  const [query, setQuery] = useState(initialQuery);
  const localDay = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: query.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const [fromDate, setFromDate] = useState(() => localDay(query.from)), [toDate, setToDate] = useState(() => localDay(new Date(Date.parse(query.to) - 1).toISOString()));
  const [report, setReport] = useState<ConsoleReport | undefined>();
  const [accounts, setAccounts] = useState([] as SocialAccount[]), [jobs, setJobs] = useState([] as SocialJob[]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [text, setText] = useState(''), [imageUrl, setImageUrl] = useState(''), [schedule, setSchedule] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID()), [csv, setCsv] = useState('');
  const sequence = useRef(0), mounted = useRef(true);
  const reload = useCallback(async () => {
    const id = ++sequence.current; setLoading(true);
    const values = await Promise.allSettled([(page === 'overview' || page === 'campaigns') ? provider.report(query) : Promise.resolve(undefined), provider.accounts(), provider.jobs()] as const);
    if (!mounted.current || id !== sequence.current) return;
    if (values[0].status === 'fulfilled') setReport(values[0].value);
    if (values[1].status === 'fulfilled') setAccounts(values[1].value);
    if (values[2].status === 'fulfilled') setJobs(values[2].value);
    const failed = values.find(value => value.status === 'rejected');
    setError(failed?.status === 'rejected' ? message(failed.reason) : ''); setLoading(false);
  }, [provider, query, page]);
  useEffect(() => {
    mounted.current = true;
    if (!access.read.allowed) { sequence.current++; setAccounts([]); setJobs([]); setReport(undefined); setLoading(false); return () => { mounted.current=false; sequence.current++; }; }
    void reload();
    const timer = setInterval(() => { const id = sequence.current; void provider.jobs().then(value => { if (mounted.current && sequence.current === id) setJobs(value); }).catch(() => {}); }, 15000);
    return () => { mounted.current = false; sequence.current++; clearInterval(timer); };
  }, [provider, reload, access.read.allowed]);
  const perform = async (work: () => Promise<void | string>, success: string) => {
    const invocation = ++sequence.current; setBusy(true); setError(''); setNotice('');
    try { const result = await work(); if (mounted.current && invocation === sequence.current) { setNotice(typeof result === 'string' ? result : success); await reload(); } }
    catch (failure) { if (mounted.current && invocation === sequence.current) { await reload(); setError(message(failure)); } }
    finally { if (mounted.current) setBusy(false); }
  };
  useEffect(() => { onDirtyChange(Boolean(text || imageUrl || schedule || selected.length || csv || busy)); }, [text, imageUrl, schedule, selected, csv, busy, onDirtyChange]);
  const choose = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
  const date = (value: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: query.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const connected = accounts.filter(account => account.status === 'connected');
  const action = (job: SocialJob, kind: SocialJobAction) => void perform(async () => { await provider.jobAction(job.id, job.version, kind); }, '投稿の状態を更新しました。');
  const disabled = busy || loading;
  if (!access.read.allowed) return <p role="status">このデータは現在表示できません。接続状態と権限を確認してください。入力は保持しています。</p>;
  return <div className="mk-marketing-screen" aria-busy={loading || busy}>
      <div className="mk-content">
        <div className="mk-heading"><div><p className="mk-eyebrow">MARKETING</p><h1>{labels[page]}</h1><p>{page === 'posts' ? '届けたい情報を、適切なタイミングで。' : page === 'connections' ? '投稿先の接続と、記事公開時の動作を管理します。' : '流入から確定成果まで、サイトの動きを確認できます。'}</p></div><span className="mk-period">{date(query.from)} — {date(query.to)}<small>終了時刻は集計に含みません</small></span></div>
        {error && <div className="mk-alert" role="alert">{error}</div>}{notice && <div className="mk-notice" role="status">{notice}</div>}
        {(page === 'overview' || page === 'campaigns') && <form className="mk-range" onSubmit={event => {
          event.preventDefault();
          try { const nextDay = new Date(Date.parse(toDate + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10); const next = parseConsoleQuery({ ...query, from: zonedDateTimeToUtc(fromDate + 'T00:00', query.timezone), to: zonedDateTimeToUtc(nextDay + 'T00:00', query.timezone) }); setReport(undefined); setError(''); setQuery(next); }
          catch { setError('期間を確認してください。集計できる期間は最大93日です。'); }
        }}><label>開始日<input required type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} /></label><span aria-hidden="true">—</span><label>終了日<input required type="date" value={toDate} onChange={event => setToDate(event.target.value)} /></label><button disabled={disabled}>期間を適用</button><small>{query.timezone}</small></form>}
        {loading && !report && <p role="status">データを読み込んでいます…</p>}
        {(page === 'overview' || page === 'campaigns') && report && <>
          <section className="mk-stats" aria-label="期間の実績">
            {[
              ['閲覧数', report.totals.pageViews.toLocaleString('ja-JP'), 'サイト上で観測したページ閲覧'],
              ['確定成果', report.totals.confirmedConversions.toLocaleString('ja-JP'), `問い合わせ ${report.totals.leads} ／ 予約 ${report.totals.bookings}`],
              ['広告費', money(report.totals.spendMinor, report.currency), '登録済みの広告費'],
              ['ROAS', report.totals.roas === null ? '—' : report.totals.roas.toFixed(2) + '倍', '流入を照合できた売上 ÷ 広告費'],
            ].map(([label, value, note]) => <article key={label} className="mk-stat"><h2>{label}</h2><strong>{value}</strong><p>{note}</p></article>)}
          </section>
          <section className="mk-panel"><div className="mk-panel-heading"><div><h2>流入・キャンペーン別の成果</h2><p>広告媒体の管理画面とは、集計条件が異なります。</p></div><span className="mk-tag">サイトの計測データ</span></div>
            <div className="mk-table-scroll"><table><thead><tr><th>キャンペーン / 流入元</th><th>確定成果</th><th>広告費</th><th>CPA</th><th>ROAS</th></tr></thead><tbody>{report.campaigns.map((row, index) => <tr key={index}><td><strong>{row.campaign ?? 'キャンペーン未設定'}</strong><small>{row.source ?? '流入元を照合できません'}</small></td><td>{row.confirmedConversions}</td><td>{money(row.spendMinor, report.currency)}</td><td>{money(row.cpaMinor, report.currency)}</td><td>{row.roas === null ? '—' : row.roas.toFixed(2) + '倍'}</td></tr>)}</tbody></table>{report.campaigns.length === 0 && <div className="mk-empty">この期間のデータはまだありません。</div>}</div>
            <footer className="mk-panel-foot">広告費は登録済みデータのみです。未登録・通貨不一致は「—」で表示します。<br />流入元未照合の確定成果：{report.totals.unattributedConversions}件 ／ 更新：{date(report.asOf)}</footer>
          </section>
        </>}
        {page === 'overview' && <section className="mk-panel mk-next"><div><span className="mk-eyebrow">NEXT ACTION</span><h2>次のお知らせを準備する</h2><p>FacebookとInstagramへの投稿を、ここから管理できます。</p></div><button type="button" className="mk-primary" onClick={() => setPage('posts')}>SNS投稿を開く <span aria-hidden="true">↗</span></button></section>}
        {page === 'campaigns' && <form className="mk-panel mk-form" onSubmit={event => { event.preventDefault(); void perform(async () => { const result = await provider.importSpend(csv); setCsv(''); return `${result.accepted}件を取り込みました（登録済み ${result.duplicates}件）。`; }, '広告費を取り込みました。'); }}><h2>広告費を取り込む</h2><p>通貨の最小単位で入力します。JPYでは1円、USDでは1セントです。</p><label>広告費CSV<textarea required rows={6} disabled={!access.spend.allowed || busy} value={csv} onChange={event => setCsv(event.target.value)} placeholder="id,occurredAt,source,medium,campaign,amountMinor,currency" /></label><button className="mk-primary" disabled={disabled || !access.spend.allowed || !csv.trim()}>CSVを取り込む</button></form>}
        {page === 'posts' && <div className="mk-post-layout">
          <form className="mk-panel mk-form" onSubmit={event => { event.preventDefault(); void perform(async () => { await provider.createPost({ idempotencyKey: requestKey, accountIds: selected, text, ...(imageUrl ? { imageUrl } : {}), ...(schedule ? { scheduledAt: zonedDateTimeToUtc(schedule, query.timezone) } : {}) }); setText(''); setImageUrl(''); setSchedule(''); setRequestKey(crypto.randomUUID()); }, '投稿を登録しました。予約時刻または次の配信処理で送信されます。'); }}>
            <div><span className="mk-eyebrow">NEW POST</span><h2>投稿を作成</h2></div>
            <fieldset><legend>投稿先</legend>{connected.length === 0 && <p>接続設定から投稿先を接続してください。</p>}{connected.map(account => <label className="mk-check" key={account.id}><input type="checkbox" checked={selected.includes(account.id)} disabled={busy || !access.post.allowed} onChange={() => { setSelected(choose(selected, account.id)); setRequestKey(crypto.randomUUID()); }} />{account.platform === 'facebook' ? 'Facebook' : 'Instagram'} · {account.name}</label>)}</fieldset>
            <label>投稿文<textarea required rows={6} maxLength={selected.some(id => accounts.find(a => a.id === id)?.platform === 'instagram') ? 2200 : 63206} value={text} disabled={busy || !access.post.allowed} onChange={event => { setText(event.target.value); setRequestKey(crypto.randomUUID()); }} placeholder="伝えたいことを書いてください。" /></label>
            <label>画像URL<input type="url" value={imageUrl} disabled={busy || !access.post.allowed} onChange={event => { setImageUrl(event.target.value); setRequestKey(crypto.randomUUID()); }} placeholder="https://…/image.jpg" required={selected.some(id => accounts.find(a => a.id === id)?.platform === 'instagram')} /></label><p className="mk-help">Instagramは画像が必要です。承認済みの画像配信先を利用してください。</p>
            <label>予約日時（{query.timezone}）<input type="datetime-local" value={schedule} disabled={busy || !access.post.allowed} onChange={event => { setSchedule(event.target.value); setRequestKey(crypto.randomUUID()); }} /></label><p className="mk-help">空欄なら、次の配信処理で送信します。</p>
            <button className="mk-primary" disabled={disabled || !access.post.allowed || !selected.length || !text.trim()}>投稿を登録する <span aria-hidden="true">↗</span></button>
          </form>
          <section className="mk-panel mk-posts"><div className="mk-panel-heading"><div><h2>投稿の履歴・予約</h2><p>媒体ごとに公開状況を確認できます。</p></div><span className="mk-tag">{jobs.length}件</span></div>
            {jobs.length === 0 && <div className="mk-empty">最初の投稿を作成しましょう。</div>}{[...jobs].reverse().map(job => <article className="mk-job" key={job.id}><header><strong>{job.platform === 'facebook' ? 'Facebook' : 'Instagram'}</strong><span className={'mk-status mk-status-' + job.status}>{statusLabels[job.status]}</span></header><p>{job.text}</p><small>{date(job.scheduledAt ?? job.createdAt)} · {query.timezone}</small>{job.status === 'unknown' && <p className="mk-help">重複投稿を防ぐため自動再送を止めています。SNS上の公開状況を確認してください。</p>}{job.errorCode === 'reconnect_required' && <p className="mk-help">投稿先の再接続が必要です。</p>}<div className="mk-job-actions">
              {job.status === 'draft' && <button disabled={disabled || !access.post.allowed} onClick={() => action(job, 'approve')}>承認して配信</button>}
              {['draft', 'queued', 'scheduled', 'retry_wait', 'failed'].includes(job.status) && <button disabled={disabled || !access.post.allowed} onClick={() => action(job, 'cancel')}>キャンセル</button>}
              {['failed', 'retry_wait'].includes(job.status) && <button disabled={disabled || !access.post.allowed} onClick={() => action(job, 'retry')}>再試行</button>}
              {job.status === 'unknown' && <button disabled={disabled || !access.reconcile.allowed} onClick={() => action(job, 'reconcile')}>公開状況を照合</button>}
              {job.externalUrl && <a href={job.externalUrl} target="_blank" rel="noopener noreferrer">公開した投稿を見る ↗</a>}
            </div></article>)}
          </section>
        </div>}
        {page === 'connections' && <>
          <section className="mk-panel"><div className="mk-panel-heading"><div><h2>投稿先アカウント</h2><p>Facebookページと、連携するInstagramアカウントを接続します。</p></div><button className="mk-primary" disabled={disabled || !access.connect.allowed} onClick={() => void perform(async () => { const result = await provider.connect(); if (mounted.current) window.location.assign(result.url); }, '接続画面に移動します。')}>Metaと接続</button></div>
            {accounts.length === 0 && <div className="mk-empty">接続済みの投稿先はありません。</div>}{accounts.map(account => <div className="mk-account" key={account.id}><div><strong>{account.name}</strong><small>{account.platform === 'facebook' ? 'Facebook' : 'Instagram'} · {account.status === 'connected' ? '接続済み' : account.status === 'disconnected' ? '接続解除済み' : '再接続が必要'} · 有効期限 {date(account.expiresAt)}</small></div>{account.status !== 'disconnected' && <button disabled={disabled || !access.disconnect.allowed} onClick={() => void perform(() => provider.disconnect(account.id, account.version), '接続を解除しました。待機中の投稿は停止します。')}>接続解除</button>}</div>)}
          </section>
          <p className="mk-help">自動投稿・承認ルールは「設定」で保存し、適用してください。接続・投稿・広告費の操作は実行時に反映されます。</p>
        </>}
      </div>
  </div>;
}
