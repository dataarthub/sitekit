/** Shared UI copy, kept separate from rendering and tracking code. */
export const consentContent = {
  /** English consent-panel messages. */ en: {
    /** Dialog heading describing consent preferences. */ title: 'Cookie preferences',
    /** Explanation of optional analytics and collection scope. */ description: 'We use optional analytics cookies and browser storage, including Google Analytics when configured, to understand site use and improve this website. Analytics stays off until you allow it. Form contents are not collected by this analytics feature.',
    /** Explanation of necessary storage for privacy preferences. */ necessary: 'Necessary storage keeps your privacy choice. You can use the site without optional analytics.',
    /** Button label granting optional analytics. */ allow: 'Allow analytics',
  /** Button label rejecting optional analytics. */ deny: 'Reject optional analytics',
  /** Preferences-dialog close button label. */ close: 'Close',
  /** Privacy-policy link label. */ policy: 'Privacy policy',
    /** Message shown when browser privacy signals block analytics. */ blocked: 'Your browser privacy signal disables analytics.',
  },
  /** Japanese consent-panel messages. */ ja: {
    /** Dialog heading describing consent preferences. */ title: 'Cookie・アクセス解析の設定',
    /** Explanation of optional analytics and collection scope. */ description: 'サイトの利用状況を把握し改善するため、任意の解析Cookieとブラウザー保存領域を使用します。設定されている場合はGoogle Analyticsも使用します。許可するまで解析は開始しません。この解析機能ではフォームの入力内容を収集しません。',
    /** Explanation of necessary storage for privacy preferences. */ necessary: '同意設定を保存するための保存領域を使用します。任意の解析を拒否してもサイトを利用できます。',
    /** Button label granting optional analytics. */ allow: 'アクセス解析を許可',
  /** Button label rejecting optional analytics. */ deny: '任意の解析を拒否',
  /** Preferences-dialog close button label. */ close: '閉じる',
  /** Privacy-policy link label. */ policy: 'プライバシーポリシー',
    /** Message shown when browser privacy signals block analytics. */ blocked: 'ブラウザーのプライバシー設定によりアクセス解析は無効です。',
  },
} as const;
