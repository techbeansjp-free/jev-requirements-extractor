import type { Utterance } from "../shared/types.ts";

/** 行頭のタイムスタンプ。[00:12:34] 00:12 (0:12:34) などを落とす */
const TIMESTAMP = /^\s*[[(（]?\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?[\])）]?\s*/;
/** 「話者: 発言」「話者(所属): 発言」。コロンは全角も受ける */
const SPEAKER = /^\s*([^\s:：][^:：]{0,30}?)\s*[:：]\s*(.*)$/;

/**
 * 文字起こしを話者単位に割る。話者が取れない行は直前の発言に続けて扱い、
 * 冒頭から話者が一度も現れない場合は段落単位で切る。
 */
export function parseTranscript(raw: string): Utterance[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const utterances: Utterance[] = [];
  let id = 0;

  for (const line of lines) {
    const stripped = line.replace(TIMESTAMP, "");
    if (!stripped.trim()) continue;

    const m = stripped.match(SPEAKER);
    // コロンを含むだけの通常文を話者行と誤認しないよう、話者名の長さで足切りする
    if (m && m[1].length <= 24 && m[2].trim()) {
      utterances.push({ id: ++id, speaker: m[1].trim(), text: m[2].trim() });
      continue;
    }

    const last = utterances[utterances.length - 1];
    if (last) {
      last.text += ` ${stripped.trim()}`;
    } else {
      utterances.push({ id: ++id, speaker: "不明", text: stripped.trim() });
    }
  }

  return utterances;
}

export function formatUtterance(u: Utterance): string {
  return `[${u.id}] ${u.speaker}: ${u.text}`;
}

export function formatTranscript(utterances: Utterance[]): string {
  return utterances.map(formatUtterance).join("\n");
}
