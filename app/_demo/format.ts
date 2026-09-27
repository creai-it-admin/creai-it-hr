const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10-06T09:00:00+09:00" → "10/06 09:00" (모든 시각은 KST로 기록돼 있다). */
export function stamp(iso: string | null | undefined) {
  if (!iso) return "기록 없음";
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)} ${iso.slice(11, 16)}`;
}

export function fullStamp(iso: string | null | undefined) {
  if (!iso) return "기록 없음";
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function utc(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** "2026-10-22" → "10/22(목)" */
export function day(date: string) {
  return `${date.slice(5, 7)}/${date.slice(8, 10)}(${WEEK[new Date(utc(date)).getUTCDay()]})`;
}

export function daysLeft(date: string, now: string) {
  return Math.round((utc(date) - utc(now.slice(0, 10))) / 86_400_000);
}

export function dday(date: string, now: string) {
  const n = daysLeft(date, now);
  return n === 0 ? "D-DAY" : n > 0 ? `D-${n}` : `D+${-n}`;
}

function batchim(word: string) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return /[013678LMNRlmnr]$/.test(word);
  return (code - 0xac00) % 28 !== 0;
}

/** 받침에 맞는 조사: josa("서울", "이에요", "예요") → "서울이에요" */
export function josa(word: string, withFinal: string, without: string) {
  return word + (batchim(word) ? withFinal : without);
}

/** 으로/로: 받침이 없거나 ㄹ 받침이면 "로" */
export function ro(word: string) {
  const code = word.charCodeAt(word.length - 1);
  const final =
    code >= 0xac00 && code <= 0xd7a3
      ? (code - 0xac00) % 28
      : batchim(word)
        ? 1
        : 0;
  return word + (final === 0 || final === 8 ? "로" : "으로");
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}만원`;
