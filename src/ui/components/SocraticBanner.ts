/**
 * SocraticBanner component.
 *
 * A collapsible banner shown during an active Socratic dialogue session.
 * Collapsed by default; expands to show session guide and rules.
 */

const RULE_CARDS = [
  { icon: '💬', text: '정답 대신 질문으로 생각을 이끕니다.' },
  { icon: '🧠', text: '답을 추론하며 스스로 설명해보세요.' },
  { icon: '🌱', text: "막히면 '모르겠어요'를 입력하세요." },
  { icon: '↺', text: '종료: 대화 초기화 또는 새 대화 시작' },
];

/**
 * SocraticBanner - collapsible info banner for active Socratic sessions.
 */
export class SocraticBanner {
  private containerEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private liveRegion: HTMLElement | null = null;
  private isExpanded = false;

  /**
   * Mount the banner into the container.
   * Should be called after the container is created, inserts between header and messages.
   */
  mount(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap';
    containerEl.appendChild(this.liveRegion);
  }

  /**
   * Show the banner with the given session info.
   */
  show(scopeLabel: string, focusText?: string): void {
    if (!this.containerEl) return;

    if (this.bannerEl) {
      this.bannerEl.remove();
      this.bannerEl = null;
      this.contentEl = null;
    }

    this.isExpanded = false;
    this.containerEl.classList.add('ocop-socratic-active');
    if (this.liveRegion) this.liveRegion.textContent = '소크라테스 학습 모드가 시작되었습니다.';

    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'ocop-socratic-banner';

    // Header (clickable to toggle)
    const headerEl = document.createElement('button');
    headerEl.type = 'button';
    headerEl.className = 'ocop-socratic-banner-header';
    headerEl.setAttribute('aria-expanded', 'false');
    headerEl.setAttribute('aria-controls', 'ocop-socratic-banner-content');
    headerEl.addEventListener('click', () => this.toggle());

    const iconEl = document.createElement('span');
    iconEl.className = 'ocop-socratic-banner-icon';
    iconEl.textContent = '🦉';
    headerEl.appendChild(iconEl);

    const titleEl = document.createElement('span');
    titleEl.className = 'ocop-socratic-banner-title';
    titleEl.textContent = '소크라테스 학습 모드 진행 중';
    if (focusText) {
      const topicEl = document.createElement('span');
      topicEl.className = 'ocop-socratic-banner-topic';
      topicEl.textContent = ` — ${focusText}`;
      titleEl.appendChild(topicEl);
    }
    headerEl.appendChild(titleEl);

    const badgeEl = document.createElement('span');
    badgeEl.className = 'ocop-socratic-banner-badge';
    badgeEl.textContent = '진행 중';
    headerEl.appendChild(badgeEl);

    const chevronEl = document.createElement('span');
    chevronEl.className = 'ocop-socratic-banner-chevron';
    chevronEl.textContent = '▶';
    headerEl.appendChild(chevronEl);

    this.bannerEl.appendChild(headerEl);

    // Content area (hidden by default)
    this.contentEl = document.createElement('div');
    this.contentEl.id = 'ocop-socratic-banner-content';
    this.contentEl.className = 'ocop-socratic-banner-content';
    this.contentEl.style.display = 'none';

    // Rule cards grid
    const gridEl = document.createElement('div');
    gridEl.className = 'ocop-socratic-banner-grid';

    for (const rule of RULE_CARDS) {
      const card = document.createElement('div');
      card.className = 'ocop-socratic-rule-card';

      const ruleIcon = document.createElement('span');
      ruleIcon.className = 'ocop-socratic-rule-icon';
      ruleIcon.textContent = rule.icon;
      card.appendChild(ruleIcon);

      const ruleText = document.createElement('p');
      ruleText.textContent = rule.text;
      card.appendChild(ruleText);

      gridEl.appendChild(card);
    }
    this.contentEl.appendChild(gridEl);

    // Scope label
    const scopeEl = document.createElement('div');
    scopeEl.className = 'ocop-socratic-banner-scope';
    scopeEl.textContent = `범위: ${scopeLabel}`;
    this.contentEl.appendChild(scopeEl);

    this.bannerEl.appendChild(this.contentEl);

    const messagesEl = this.containerEl.querySelector('.ocop-messages');
    if (messagesEl) {
      this.containerEl.insertBefore(this.bannerEl, messagesEl);
    } else {
      this.containerEl.appendChild(this.bannerEl);
    }
  }

  /**
   * Hide and remove the banner.
   */
  hide(): void {
    if (this.bannerEl) {
      this.bannerEl.remove();
      this.bannerEl = null;
      this.contentEl = null;
    }
    this.containerEl?.classList.remove('ocop-socratic-active');
    this.isExpanded = false;
    if (this.liveRegion) this.liveRegion.textContent = '';
  }

  private toggle(): void {
    this.isExpanded = !this.isExpanded;
    this.updateDisplay();
  }

  private updateDisplay(): void {
    if (!this.bannerEl || !this.contentEl) return;

    const header = this.bannerEl.querySelector('.ocop-socratic-banner-header');
    header?.setAttribute('aria-expanded', String(this.isExpanded));

    const chevron = this.bannerEl.querySelector('.ocop-socratic-banner-chevron');
    if (chevron) {
      chevron.textContent = this.isExpanded ? '▼' : '▶';
    }

    this.contentEl.style.display = this.isExpanded ? 'block' : 'none';
    this.bannerEl.classList.toggle('expanded', this.isExpanded);
  }

  isVisible(): boolean {
    return this.bannerEl !== null;
  }
}
