/**
 * View Toggle - Handles switching between card and icon views
 * Manages theme switching and view state persistence
 */

export type ViewMode = 'card' | 'icon';

export interface ViewToggleOptions {
  readonly onViewChange?: (mode: ViewMode) => void;
  readonly persistState?: boolean;
  readonly storageKey?: string;
}

export class ViewToggle {
  private currentView: ViewMode = 'card';
  private readonly options: ViewToggleOptions;
  private readonly cardStylesheet: HTMLLinkElement;
  private readonly iconStylesheet: HTMLLinkElement;

  constructor(options: ViewToggleOptions = {}) {
    this.options = {
      persistState: true,
      storageKey: 'visual-programming-view-mode',
      ...options
    };

    // Create stylesheets
    this.cardStylesheet = this.createStylesheet('/src/themes/card.css', 'card-theme');
    this.iconStylesheet = this.createStylesheet('/src/themes/icon.css', 'icon-theme');
    
    // Load saved state
    if (this.options.persistState) {
      this.loadSavedState();
    }
    
    this.applyView(this.currentView);
  }

  /**
   * Get current view mode
   */
  getCurrentView(): ViewMode {
    return this.currentView;
  }

  /**
   * Set view mode
   */
  setView(mode: ViewMode): void {
    if (mode !== 'card' && mode !== 'icon') {
      throw new TypeError('View mode must be "card" or "icon"');
    }

    if (mode === this.currentView) {
      return;
    }

    this.currentView = mode;
    this.applyView(mode);
    this.saveState();
    this.options.onViewChange?.(mode);
  }

  /**
   * Toggle between card and icon view
   */
  toggle(): ViewMode {
    const newMode = this.currentView === 'card' ? 'icon' : 'card';
    this.setView(newMode);
    return newMode;
  }

  /**
   * Check if currently in icon view
   */
  isIconView(): boolean {
    return this.currentView === 'icon';
  }

  /**
   * Check if currently in card view
   */
  isCardView(): boolean {
    return this.currentView === 'card';
  }

  /**
   * Apply view mode to DOM
   */
  private applyView(mode: ViewMode): void {
    const body = document.body;
    
    // Update body class
    body.classList.toggle('icon-view', mode === 'icon');
    body.classList.toggle('card-view', mode === 'card');
    
    // Update stylesheets
    if (mode === 'icon') {
      this.iconStylesheet.disabled = false;
      // Keep card stylesheet enabled as base
    } else {
      this.iconStylesheet.disabled = true;
    }

    // Add transition class temporarily for smooth animation
    body.classList.add('view-transitioning');
    setTimeout(() => {
      body.classList.remove('view-transitioning');
    }, 300);
  }

  /**
   * Create stylesheet link element
   */
  private createStylesheet(href: string, id: string): HTMLLinkElement {
    // Check if stylesheet already exists
    let existing = document.getElementById(id) as HTMLLinkElement;
    if (existing) {
      return existing;
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.disabled = true; // Start disabled
    
    document.head.appendChild(link);
    return link;
  }

  /**
   * Load saved state from localStorage
   */
  private loadSavedState(): void {
    if (!this.options.persistState || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const saved = localStorage.getItem(this.options.storageKey!);
      if (saved && (saved === 'card' || saved === 'icon')) {
        this.currentView = saved;
      }
    } catch (error) {
      console.warn('Failed to load view state from localStorage:', error);
    }
  }

  /**
   * Save current state to localStorage
   */
  private saveState(): void {
    if (!this.options.persistState || typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.options.storageKey!, this.currentView);
    } catch (error) {
      console.warn('Failed to save view state to localStorage:', error);
    }
  }
}

/**
 * Create view toggle button with automatic event handling
 */
export function createViewToggleButton(
  buttonElement: HTMLElement, 
  viewToggle: ViewToggle,
  options: {
    cardText?: string;
    iconText?: string;
    cardIcon?: string;
    iconIcon?: string;
  } = {}
): void {
  if (!buttonElement) {
    throw new TypeError('Button element is required');
  }

  const config = {
    cardText: 'Card View',
    iconText: 'Icon View',
    cardIcon: '🎛',
    iconIcon: '📱',
    ...options
  };

  const updateButtonText = (mode: ViewMode): void => {
    const isIcon = mode === 'icon';
    const text = isIcon ? config.cardText : config.iconText;
    const icon = isIcon ? config.cardIcon : config.iconIcon;
    
    buttonElement.textContent = `${icon} ${text}`;
    buttonElement.title = `Switch to ${text.toLowerCase()}`;
  };

  // Set initial state
  updateButtonText(viewToggle.getCurrentView());

  // Handle clicks
  buttonElement.addEventListener('click', () => {
    const newMode = viewToggle.toggle();
    updateButtonText(newMode);
  });

  // Handle external view changes
  const originalOnViewChange = viewToggle['options'].onViewChange;
  viewToggle['options'].onViewChange = (mode: ViewMode) => {
    updateButtonText(mode);
    originalOnViewChange?.(mode);
  };
}

/**
 * Add CSS for smooth view transitions
 */
export function addViewTransitionStyles(): void {
  const styleId = 'view-transition-styles';
  if (document.getElementById(styleId)) {
    return; // Already added
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .view-transitioning .element {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    
    .view-transitioning .connection-line {
      transition: all 0.3s ease !important;
    }
    
    .view-transitioning .connection-point {
      transition: all 0.3s ease !important;
    }
    
    /* Stagger animation for multiple elements */
    .view-transitioning .element:nth-child(1) { transition-delay: 0ms; }
    .view-transitioning .element:nth-child(2) { transition-delay: 50ms; }
    .view-transitioning .element:nth-child(3) { transition-delay: 100ms; }
    .view-transitioning .element:nth-child(4) { transition-delay: 150ms; }
    .view-transitioning .element:nth-child(5) { transition-delay: 200ms; }
    .view-transitioning .element:nth-child(n+6) { transition-delay: 250ms; }
  `;
  
  document.head.appendChild(style);
}