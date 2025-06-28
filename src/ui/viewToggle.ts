/**
 * View Toggle - Handles switching between card and icon views
 * Manages theme switching and view state persistence with comprehensive error handling
 */

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type ViewMode = 'card' | 'icon';

export interface ViewToggleOptions {
  readonly onViewChange?: (mode: ViewMode) => void;
  readonly persistState?: boolean;
  readonly storageKey?: string;
  readonly defaultView?: ViewMode;
  readonly enableTransitions?: boolean;
  readonly transitionDuration?: number;
}

export interface ViewToggleButtonOptions {
  readonly cardText?: string;
  readonly iconText?: string;
  readonly cardIcon?: string;
  readonly iconIcon?: string;
  readonly showIcon?: boolean;
  readonly showText?: boolean;
}

interface ViewState {
  readonly currentView: ViewMode;
  readonly isTransitioning: boolean;
  readonly lastChanged: number;
}

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validates view mode value
 */
function validateViewMode(mode: unknown): asserts mode is ViewMode {
  if (typeof mode !== 'string') {
    throw new TypeError('View mode must be a string');
  }
  if (mode !== 'card' && mode !== 'icon') {
    throw new TypeError('View mode must be "card" or "icon"');
  }
}

/**
 * Validates view toggle options
 */
function validateViewToggleOptions(options: ViewToggleOptions): void {
  if (options.defaultView !== undefined) {
    validateViewMode(options.defaultView);
  }

  if (options.storageKey !== undefined) {
    if (typeof options.storageKey !== 'string' || options.storageKey.trim() === '') {
      throw new TypeError('Storage key must be a non-empty string');
    }
    if (options.storageKey.length > 100) {
      throw new TypeError('Storage key too long (max 100 characters)');
    }
  }

  if (options.transitionDuration !== undefined) {
    if (typeof options.transitionDuration !== 'number' || options.transitionDuration < 0) {
      throw new TypeError('Transition duration must be a non-negative number');
    }
    if (options.transitionDuration > 5000) {
      throw new RangeError('Transition duration too long (max 5000ms)');
    }
  }

  if (options.onViewChange !== undefined && typeof options.onViewChange !== 'function') {
    throw new TypeError('onViewChange must be a function');
  }
}

/**
 * Validates button element
 */
function validateButtonElement(element: unknown): asserts element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) {
    throw new TypeError('Button element must be a valid HTMLElement');
  }
  if (!element.isConnected) {
    throw new Error('Button element must be attached to the DOM');
  }
}

/**
 * Validates button options
 */
function validateButtonOptions(options: ViewToggleButtonOptions): void {
  const stringFields = ['cardText', 'iconText', 'cardIcon', 'iconIcon'] as const;
  
  for (const field of stringFields) {
    const value = options[field];
    if (value !== undefined) {
      if (typeof value !== 'string') {
        throw new TypeError(`${field} must be a string if provided`);
      }
      if (value.length > 50) {
        throw new TypeError(`${field} too long (max 50 characters)`);
      }
    }
  }

  const booleanFields = ['showIcon', 'showText'] as const;
  
  for (const field of booleanFields) {
    const value = options[field];
    if (value !== undefined && typeof value !== 'boolean') {
      throw new TypeError(`${field} must be a boolean if provided`);
    }
  }
}

/**
 * Sanitizes text content for safe DOM insertion
 */
function sanitizeText(text: unknown): string {
  if (typeof text !== 'string') {
    text = String(text);
  }
  return (text as string)
    .replace(/[<>'"&]/g, '')
    .slice(0, 100);
}

/**
 * Checks if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  try {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    const testKey = '__localStorage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// ViewToggle Implementation
// ---------------------------------------------------------------------------

/**
 * ViewToggle manages switching between card and icon view modes
 * with persistence and comprehensive error handling
 */
export class ViewToggle {
  private readonly options: Required<ViewToggleOptions>;
  private readonly state: ViewState;
  private readonly cardStylesheet: HTMLLinkElement;
  private readonly iconStylesheet: HTMLLinkElement;
  private transitionTimer?: number;
  private isDisposed = false;
  private readonly boundButtons = new Set<HTMLElement>();

  /**
   * Creates a new ViewToggle instance
   * @param options - Configuration options for the view toggle
   * @throws {TypeError} If options are invalid
   */
  constructor(options: ViewToggleOptions = {}) {
    validateViewToggleOptions(options);

    this.options = {
      persistState: true,
      storageKey: 'visual-programming-view-mode',
      defaultView: 'card',
      enableTransitions: true,
      transitionDuration: 300,
      onViewChange: () => {},
      ...options
    };

    // Initialize state
    this.state = {
      currentView: this.options.defaultView,
      isTransitioning: false,
      lastChanged: Date.now()
    } as ViewState;

    try {
      // Create and validate stylesheets
      this.cardStylesheet = this.createStylesheet('/src/themes/card.css', 'card-theme');
      this.iconStylesheet = this.createStylesheet('/src/themes/icon.css', 'icon-theme');
      
      // Load saved state if persistence is enabled
      if (this.options.persistState) {
        this.loadSavedState();
      }
      
      // Apply initial view
      this.applyView(this.state.currentView, false);
      
    } catch (error) {
      throw new Error(
        `Failed to initialize ViewToggle: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get current view mode
   * @returns Current view mode
   */
  getCurrentView(): ViewMode {
    this.checkDisposed();
    return this.state.currentView;
  }

  /**
   * Set view mode with validation
   * @param mode - View mode to set
   * @throws {TypeError} If mode is invalid
   */
  setView(mode: ViewMode): void {
    this.checkDisposed();
    validateViewMode(mode);

    if (mode === this.state.currentView) {
      return; // No change needed
    }

    if ((this.state as any).isTransitioning) {
      console.warn('View change already in progress, ignoring request');
      return;
    }

    try {
      (this.state as any).currentView = mode;
      (this.state as any).lastChanged = Date.now();
      
      this.applyView(mode, this.options.enableTransitions);
      this.saveState();
      this.notifyViewChange(mode);
      
    } catch (error) {
      console.error('Failed to set view mode:', error);
      // Attempt to revert to previous state
      this.applyView(this.state.currentView, false);
    }
  }

  /**
   * Toggle between card and icon view
   * @returns New view mode after toggle
   */
  toggle(): ViewMode {
    this.checkDisposed();
    
    const newMode = this.state.currentView === 'card' ? 'icon' : 'card';
    this.setView(newMode);
    return newMode;
  }

  /**
   * Check if currently in icon view
   * @returns True if in icon view
   */
  isIconView(): boolean {
    this.checkDisposed();
    return this.state.currentView === 'icon';
  }

  /**
   * Check if currently in card view
   * @returns True if in card view
   */
  isCardView(): boolean {
    this.checkDisposed();
    return this.state.currentView === 'card';
  }

  /**
   * Check if view is currently transitioning
   * @returns True if transitioning
   */
  isTransitioning(): boolean {
    this.checkDisposed();
    return this.state.isTransitioning;
  }

  /**
   * Get view toggle statistics
   * @returns Current state information
   */
  getStats(): Readonly<{
    currentView: ViewMode;
    isTransitioning: boolean;
    lastChanged: number;
    boundButtons: number;
    persistenceEnabled: boolean;
    storageAvailable: boolean;
  }> {
    this.checkDisposed();
    
    return Object.freeze({
      currentView: this.state.currentView,
      isTransitioning: this.state.isTransitioning,
      lastChanged: this.state.lastChanged,
      boundButtons: this.boundButtons.size,
      persistenceEnabled: this.options.persistState,
      storageAvailable: isLocalStorageAvailable()
    });
  }

  /**
   * Bind a button element to this view toggle
   * @param buttonElement - Button to bind
   * @param options - Button configuration options
   * @returns Cleanup function to unbind the button
   */
  bindButton(
    buttonElement: HTMLElement, 
    options: ViewToggleButtonOptions = {}
  ): () => void {
    this.checkDisposed();
    validateButtonElement(buttonElement);
    validateButtonOptions(options);

    if (this.boundButtons.has(buttonElement)) {
      throw new Error('Button element is already bound to this ViewToggle');
    }

    const config = {
      cardText: 'Card View',
      iconText: 'Icon View', 
      cardIcon: '🎛',
      iconIcon: '📱',
      showIcon: true,
      showText: true,
      ...options
    };

    // Update button text initially
    this.updateButtonText(buttonElement, this.state.currentView, config);

    // Add click handler
    const clickHandler = (e: Event) => {
      e.preventDefault();
      this.toggle();
    };

    buttonElement.addEventListener('click', clickHandler);
    this.boundButtons.add(buttonElement);

    // Return cleanup function
    return () => {
      buttonElement.removeEventListener('click', clickHandler);
      this.boundButtons.delete(buttonElement);
    };
  }

  /**
   * Dispose of view toggle resources
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    try {
      // Clear transition timer
      if (this.transitionTimer) {
        clearTimeout(this.transitionTimer);
      }

      // Remove stylesheets
      if (this.cardStylesheet?.parentNode) {
        this.cardStylesheet.remove();
      }
      if (this.iconStylesheet?.parentNode) {
        this.iconStylesheet.remove();
      }

      // Clear bound buttons
      this.boundButtons.clear();

      this.isDisposed = true;
      
    } catch (error) {
      console.error('Error during ViewToggle disposal:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Check if view toggle is disposed
   */
  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new Error('ViewToggle has been disposed');
    }
  }

  /**
   * Apply view mode to DOM with optional transitions
   */
  private applyView(mode: ViewMode, enableTransition: boolean): void {
    try {
      const body = document.body;
      
      if (enableTransition) {
        (this.state as any).isTransitioning = true;
        body.classList.add('view-transitioning');
      }
      
      // Update body classes
      body.classList.toggle('icon-view', mode === 'icon');
      body.classList.toggle('card-view', mode === 'card');
      
      // Update stylesheets
      this.iconStylesheet.disabled = mode !== 'icon';
      // Card stylesheet stays enabled as it provides base styles
      
      // Update bound buttons
      this.updateAllButtons(mode);
      
      if (enableTransition) {
        // Clear transition state after animation
        this.transitionTimer = window.setTimeout(() => {
          body.classList.remove('view-transitioning');
          (this.state as any).isTransitioning = false;
        }, this.options.transitionDuration);
      }
      
    } catch (error) {
      console.error('Failed to apply view mode:', error);
      (this.state as any).isTransitioning = false;
    }
  }

  /**
   * Create stylesheet link element safely
   */
  private createStylesheet(href: string, id: string): HTMLLinkElement {
    // Check if stylesheet already exists
    const existing = document.getElementById(id) as HTMLLinkElement;
    if (existing && existing instanceof HTMLLinkElement) {
      return existing;
    }

    // Remove any existing element with the same ID
    if (existing) {
      existing.remove();
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.disabled = true; // Start disabled
    
    // Add error handling
    link.onerror = () => {
      console.warn(`Failed to load stylesheet: ${href}`);
    };
    
    document.head.appendChild(link);
    return link;
  }

  /**
   * Load saved state from localStorage safely
   */
  private loadSavedState(): void {
    if (!this.options.persistState || !isLocalStorageAvailable()) {
      return;
    }

    try {
      const saved = localStorage.getItem(this.options.storageKey);
      if (saved) {
        validateViewMode(saved);
        (this.state as any).currentView = saved;
      }
    } catch (error) {
      console.warn('Failed to load view state from localStorage:', error);
      // Continue with default state
    }
  }

  /**
   * Save current state to localStorage safely
   */
  private saveState(): void {
    if (!this.options.persistState || !isLocalStorageAvailable()) {
      return;
    }

    try {
      localStorage.setItem(this.options.storageKey, this.state.currentView);
    } catch (error) {
      console.warn('Failed to save view state to localStorage:', error);
    }
  }

  /**
   * Update button text and appearance
   */
  private updateButtonText(
    buttonElement: HTMLElement, 
    mode: ViewMode, 
    config: Required<ViewToggleButtonOptions>
  ): void {
    try {
      const isIcon = mode === 'icon';
      const text = isIcon ? config.cardText : config.iconText;
      const icon = isIcon ? config.cardIcon : config.iconIcon;
      
      let content = '';
      
      if (config.showIcon && icon) {
        content += sanitizeText(icon);
      }
      
      if (config.showText && text) {
        if (content) content += ' ';
        content += sanitizeText(text);
      }
      
      buttonElement.textContent = content || 'Toggle View';
      buttonElement.title = `Switch to ${sanitizeText(text).toLowerCase()}`;
      buttonElement.setAttribute('aria-label', `Switch to ${sanitizeText(text).toLowerCase()}`);
      
    } catch (error) {
      console.warn('Failed to update button text:', error);
      buttonElement.textContent = 'Toggle View';
    }
  }

  /**
   * Update all bound buttons
   */
  private updateAllButtons(mode: ViewMode): void {
    for (const button of this.boundButtons) {
      if (button.isConnected) {
        // Try to get stored config or use defaults
        const config = {
          cardText: 'Card View',
          iconText: 'Icon View',
          cardIcon: '🎛',
          iconIcon: '📱',
          showIcon: true,
          showText: true
        };
        
        this.updateButtonText(button, mode, config);
      } else {
        // Remove disconnected buttons
        this.boundButtons.delete(button);
      }
    }
  }

  /**
   * Notify view change callback safely
   */
  private notifyViewChange(mode: ViewMode): void {
    if (this.options.onViewChange) {
      try {
        this.options.onViewChange(mode);
      } catch (error) {
        console.error('Error in view change callback:', error);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Create view toggle button with automatic event handling
 * @param buttonElement - Button element to bind
 * @param viewToggle - ViewToggle instance
 * @param options - Button configuration options
 * @returns Cleanup function
 * @deprecated Use viewToggle.bindButton() instead
 */
export function createViewToggleButton(
  buttonElement: HTMLElement, 
  viewToggle: ViewToggle,
  options: ViewToggleButtonOptions = {}
): () => void {
  console.warn('createViewToggleButton is deprecated, use viewToggle.bindButton() instead');
  return viewToggle.bindButton(buttonElement, options);
}

/**
 * Add CSS for smooth view transitions
 * This function is idempotent and safe to call multiple times
 */
export function addViewTransitionStyles(): void {
  const styleId = 'view-transition-styles';
  
  // Check if styles already exist
  if (document.getElementById(styleId)) {
    return;
  }

  try {
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
      
      /* Smooth opacity transitions */
      .view-transitioning {
        transition: all 0.3s ease;
      }
      
      /* Ensure elements don't flicker during transition */
      .element {
        backface-visibility: hidden;
        transform: translateZ(0);
      }
    `;
    
    document.head.appendChild(style);
    
  } catch (error) {
    console.error('Failed to add view transition styles:', error);
  }
}

/**
 * Create a ViewToggle instance with validation and error handling
 * @param options - ViewToggle options
 * @returns ViewToggle instance
 * @throws {Error} If creation fails
 */
export function createViewToggle(options: ViewToggleOptions = {}): ViewToggle {
  try {
    // Add transition styles automatically
    addViewTransitionStyles();
    
    // Create and return ViewToggle instance
    return new ViewToggle(options);
    
  } catch (error) {
    throw new Error(
      `Failed to create ViewToggle: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get system theme preference if available
 * @returns 'card' or 'icon' based on system preference, or null if unavailable
 */
export function getSystemThemePreference(): ViewMode | null {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return null;
    }

    // Check for user preference indicators
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    
    // Simple heuristic: mobile or reduced motion users might prefer icon view
    if (isMobile || isReducedMotion) {
      return 'icon';
    }
    
    // Default to card view
    return 'card';
    
  } catch (error) {
    console.warn('Failed to detect system theme preference:', error);
    return null;
  }
}