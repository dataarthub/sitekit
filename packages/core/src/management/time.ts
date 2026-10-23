/** Converts an unambiguous wall time in a named site timezone to UTC. */
export function zonedDateTimeToUtc(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('日時を確認してください。');
  const raw = Date.parse(value + ':00Z');
  if (!Number.isFinite(raw) || new Date(raw).toISOString().slice(0, 16) !== value) throw new Error('日時を確認してください。');
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const wall = (time: number) => formatter.format(new Date(time)).replace(' ', 'T');
  const candidates = new Set<number>();
  for (const shift of [-86400000, 0, 86400000]) {
    const reference = raw + shift;
    const offset = Date.parse(wall(reference) + ':00Z') - reference;
    const candidate = raw - offset;
    if (wall(candidate) === value) candidates.add(candidate);
  }
  if (candidates.size !== 1) throw new Error('夏時間の切替で時刻を特定できません。別の時刻を選んでください。');
  return new Date([...candidates][0]!).toISOString();
}
