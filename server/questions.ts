import type { JevQuestion } from "./jev.ts";

/**
 * JEVに投げる質問の定義。criteria の書き方が判定精度をそのまま左右するので、
 * 要件定義の実務でレビュアーが見ている観点をそのまま言語化してある。
 *
 * 質問は必ず肯定形で書くこと。「〜が含まれていないか?」のような否定疑問にすると
 * JEVは判定を反転させる(曖昧な要件ほど「曖昧語を含まない」が高く出る)。
 * 探したい対象をそのまま「〜が含まれるか?」と聞き、解釈は呼び出し側で行う。
 */

/** 前段スクリーニング。雑談・進行の発言をClaudeに渡す前に落とす */
export function screeningQuestion(utteranceId: number): JevQuestion {
  return {
    type: "noul",
    instructions: `発言[${utteranceId}]は、システム化の要求・要件を検討する材料になるか?`,
    criteria: {
      true: "業務上の困りごと、こうしてほしいという希望、守るべき制約(予算・期日・既存システム・法令)、現状業務の説明、のいずれかを含む",
      false: "挨拶・自己紹介・進行の合図・日程調整・本題と無関係な雑談のみ",
    },
  };
}

export function requirementQuestions(prefix: string): Record<string, JevQuestion> {
  return {
    [`${prefix}__kind`]: {
      type: "choice",
      instructions: "この要求はどの種類か?",
      criteria: {
        functional: "システムが何をするか(機能・画面・帳票・データの扱い)に関する要求",
        nonfunctional: "性能・可用性・セキュリティ・権限・操作性など、機能の品質に関する要求",
        constraint: "予算・期日・既存システム・体制・法令など、選択肢を縛る前提条件",
        issue: "現状の困りごとの表明にとどまり、システムに何を求めるかはまだ言語化されていない",
      },
    },
    [`${prefix}__priority`]: {
      type: "score",
      instructions: "この要求の優先度は?業務が止まるかどうかを基準に判断すること",
      criteria: [
        "言及されただけで、無くても業務は回る",
        "あると便利だが、後のフェーズに回せる",
        "業務上の痛みが明確で、初回リリースに入れたい",
        "これが無いと業務が回らない。実現しなければ導入する意味がない",
      ],
    },
    [`${prefix}__vagueness`]: {
      type: "score",
      instructions: "この要求は、このまま設計に渡せるだけ具体的か?",
      criteria: [
        "対象・条件・範囲が具体的で、このまま要件に落とせる",
        "大枠は分かるが、条件や範囲の一部を追加で確認する必要がある",
        "解釈の幅が大きく、このまま設計すると手戻りする。ヒアリングが必要",
      ],
    },
    [`${prefix}__grounded`]: {
      type: "noul",
      instructions: "この要求は、提示された発言の内容に根拠があるか?",
      criteria: {
        true: "発言の内容から直接読み取れる。表現の整理にとどまっている",
        false: "発言にない条件・数値・機能が付け加わっている。抽出側の推測が混じっている",
      },
    },
    [`${prefix}__settled`]: {
      type: "noul",
      instructions: "この要求は、その場で方針まで固まったか?",
      criteria: {
        true: "やる/やらない、またはどう実現するかまで、その場で合意できている",
        false: "要望が出ただけ、または保留・持ち帰り・検討中で終わっている",
      },
    },
  };
}

export function specQuestions(prefix: string): Record<string, JevQuestion> {
  return {
    [`${prefix}__verifiable`]: {
      type: "noul",
      instructions: "この要件は、満たしたかどうかを受け入れテストで判定できるか?",
      criteria: {
        true: "何がどうなれば満たしたと言えるかが読み取れ、テストケースに落とせる",
        false: "満たしたかどうかを判定する基準が書かれておらず、テストケースに落とせない",
      },
    },
    // 否定疑問(「含まれていないか?」)で聞くとJEVは判定が反転する。実測で
    // 曖昧な要件ほど「含まれていない」が高く出たため、探す対象を肯定形で聞く。
    [`${prefix}__vagueWords`]: {
      type: "noul",
      instructions:
        "この要件に、程度や範囲を読み手の解釈に委ねる語が含まれるか?(例: 適切に、なるべく早く、使いやすく、柔軟に、必要に応じて、等)",
      criteria: {
        true: "そのような語が含まれており、実装者によって成果物が変わる",
        false: "そのような語は含まれず、対象と条件が具体的な語で書かれている",
      },
    },
    [`${prefix}__covers`]: {
      type: "noul",
      instructions: "この要件は、元になった要求を過不足なく満たしているか?",
      criteria: {
        true: "要求が求めていたことを満たしている。要求にない範囲まで広げてもいない",
        false: "要求の一部が抜け落ちている、または要求されていない範囲まで広げている",
      },
    },
    [`${prefix}__atomic`]: {
      type: "noul",
      instructions: "この要件は、1つの事項だけを述べているか?",
      criteria: {
        true: "検証すべき事項が1つに絞られている",
        false: "複数の独立した事項が1文に詰め込まれており、分割すべき",
      },
    },
  };
}
