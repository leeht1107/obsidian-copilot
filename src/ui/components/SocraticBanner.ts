/**
 * SocraticBanner component.
 *
 * A collapsible banner shown during an active Socratic dialogue session.
 * Collapsed by default; expands to show session guide and rules.
 */

/**
 * SocraticBanner - collapsible info banner for active Socratic sessions.
 */
export class SocraticBanner {
  private containerEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private isExpanded = false;

  /**
   * Mount the banner into the container.
   * Should be called after the container is created, inserts between header and messages.
   */
  mount(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
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

    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'ocop-socratic-banner';

    // Header (clickable to toggle)
    const headerEl = document.createElement('div');
    headerEl.className = 'ocop-socratic-banner-header';
    headerEl.addEventListener('click', () => this.toggle());

    const chevronEl = document.createElement('span');
    chevronEl.className = 'ocop-socratic-banner-chevron';
    chevronEl.textContent = '▶';
    headerEl.appendChild(chevronEl);

    const titleEl = document.createElement('span');
    titleEl.className = 'ocop-socratic-banner-title';
    titleEl.textContent = '소크라테스 대화 진행 중';
    if (focusText) {
      const topicEl = document.createElement('span');
      topicEl.className = 'ocop-socratic-banner-topic';
      topicEl.textContent = ` — ${focusText}`;
      titleEl.appendChild(topicEl);
    }
    headerEl.appendChild(titleEl);

    this.bannerEl.appendChild(headerEl);

    // Content area (hidden by default)
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'ocop-socratic-banner-content';
    this.contentEl.style.display = 'none';

    const rules = [
      'AI는 질문만 합니다 — 직접 답을 주지 않습니다.',
      '스스로 생각하고 추론하여 답하세요.',
      '막히면 "모르겠어요"라고 해도 됩니다 — 더 쉬운 질문으로 안내합니다.',
      `범위: ${scopeLabel}`,
      '종료: 대화를 초기화하거나 새 대화를 시작하세요.',
    ];

    const listEl = document.createElement('ul');
    for (const rule of rules) {
      const li = document.createElement('li');
      li.textContent = rule;
      listEl.appendChild(li);
    }
    this.contentEl.appendChild(listEl);

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
    this.isExpanded = false;
  }

  private toggle(): void {
    this.isExpanded = !this.isExpanded;
    this.updateDisplay();
  }

  private updateDisplay(): void {
    if (!this.bannerEl || !this.contentEl) return;

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
