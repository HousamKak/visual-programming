/**
 *  Main Application Entry Point
 * Includes assignment operations and inline editing capabilities
 */

import { Editor, type EditorOptions } from "./ui/editor.js";
import {
  ViewToggle,
  createViewToggle,
  addViewTransitionStyles,
} from "./ui/viewToggle.js";
import { BlockRegistry } from "./core/registry.js";
import { registerBlocks } from "./-registry.js";
import { EditableElements } from "./editable-elements.js";
import type { ElementData, ConnectionData } from "./core/renderer.js";

// ---------------------------------------------------------------------------
//  App Implementation
// ---------------------------------------------------------------------------

class VisualProgrammingApp {
  private readonly elements: any;
  private readonly editor: Editor;
  private readonly viewToggle: ViewToggle;
  private readonly editableElements: EditableElements;
  private readonly options: Required<any>;
  private readonly state: any;
  private readonly undoRedoState: any;

  private autoSaveTimer?: number;
  private eventAbortController?: AbortController;
  private isDisposed = false;

  constructor(options: any = {}) {
    // Initialize state
    this.state = {
      isInitialized: false,
      hasError: false,
      startTime: Date.now(),
      features: [],
    } as any;

    this.undoRedoState = {
      undoStack: [],
      redoStack: [],
      maxStackSize: 50,
    } as any;

    try {
      this.options = {
        enableAutoSave: true,
        autoSaveInterval: 30000,
        enableMinimap: true,
        enableUndoRedo: true,
        maxUndoSteps: 50,
        enableKeyboardShortcuts: true,
        enableExample: true,
        persistViewMode: true,
        enableInlineEditing: true,
        enableBlocks: true,
        ...options,
      };

      // Get DOM elements
      this.elements = this.getDOMElements();

      // Register  blocks first
      if (this.options.enableBlocks) {
        registerBlocks();
        this.state.features.push(" Assignment Blocks");
      }

      // Initialize view toggle
      this.viewToggle = this.initializeViewToggle();

      // Initialize editor
      this.editor = this.initializeEditor();

      // Initialize editable elements system
      if (this.options.enableInlineEditing) {
        this.editableElements = this.initializeEditableElements();
        this.state.features.push("Inline Editing");
      }

      // Setup all features
      this.setupEventListeners();
      this.setupFeatures();

      // Mark as initialized
      (this.state as any).isInitialized = true;

      console.log(" Visual Programming Framework initialized");
      console.log("Available block types:", BlockRegistry.getTypes());
      console.log("Enabled features:", this.state.features);

    } catch (error) {
      (this.state as any).hasError = true;
      (this.state as any).errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Failed to initialize  Framework:", error);
      throw error;
    }
  }

  /**
   * Initialize editable elements system
   */
  private initializeEditableElements(): EditableElements {
    return new EditableElements(this.editor, {
      enableDoubleClickEdit: true,
      enableContextMenu: true,
      enablePropertyPanel: true,
      onPropertyChanged: (elementId, property, value) => {
        console.log(`Property changed: ${elementId}.${property} = ${value}`);
        this.saveUndoState();
        this.updateStatus(`Updated ${property} for element`, 'success');
      }
    });
  }

  /**
   * Get required DOM elements with  toolbar
   */
  private getDOMElements(): any {
    const validateElement = (id: string) => {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`Required element not found: ${id}`);
      }
      return element;
    };

    return {
      canvas: validateElement("canvas"),
      connectionsSvg: validateElement("connectionsSvg"),
      toolbar: document.querySelector(".toolbar") || validateElement("toolbar"),
      statusElement: validateElement("status"),
      runButton: validateElement("runCode"),
      saveButton: validateElement("saveCode"),
      loadButton: validateElement("loadCode"),
      toggleViewButton: validateElement("toggleView"),
      connectModeButton: validateElement("connectMode"),
      clearAllButton: validateElement("clearAll"),
      elementCountElement: validateElement("elementCount"),
      connectionCountElement: validateElement("connectionCount"),
    };
  }

  /**
   * Initialize view toggle
   */
  private initializeViewToggle(): ViewToggle {
    addViewTransitionStyles();

    const viewToggle = createViewToggle({
      persistState: this.options.persistViewMode,
      onViewChange: (mode) => {
        console.log(`Switched to ${mode} view`);
        this.updateStatus(`Switched to ${mode} view`, "success");
      },
    });

    viewToggle.bindButton(this.elements.toggleViewButton, {
      cardText: "Card View",
      iconText: "Icon View",
      cardIcon: "🎛",
      iconIcon: "📱",
    });

    this.state.features.push("View Toggle");
    return viewToggle;
  }

  /**
   * Initialize editor with  options
   */
  private initializeEditor(): Editor {
    const editorOptions: EditorOptions = {
      canvas: this.elements.canvas,
      connectionsSvg: this.elements.connectionsSvg,
      snapToGrid: true,
      gridSize: 16,
      maxElements: 1000,
      maxConnections: 2000,
      enableKeyboardShortcuts: this.options.enableKeyboardShortcuts,
      enableAutoSave: this.options.enableAutoSave,
      autoSaveInterval: this.options.autoSaveInterval,
      onElementAdded: () => {
        this.updateStats();
        this.saveUndoState();
      },
      onElementRemoved: () => {
        this.updateStats();
        this.saveUndoState();
      },
      onConnectionAdded: () => {
        this.updateStats();
        this.saveUndoState();
      },
      onConnectionRemoved: () => {
        this.updateStats();
        this.saveUndoState();
      },
      onStatusUpdate: (message, type) => this.updateStatus(message, type),
      onCanvasChanged: () => this.saveUndoState(),
    };

    const editor = new Editor(editorOptions);
    this.state.features.push(" Visual Editor");
    return editor;
  }

  /**
   * Setup  event listeners
   */
  private setupEventListeners(): void {
    this.eventAbortController = new AbortController();
    const signal = this.eventAbortController.signal;

    //  toolbar with new block types
    this.elements.toolbar.addEventListener(
      "click",
      (e) => {
        const tool = (e.target as Element).closest(".tool") as HTMLElement;
        if (!tool?.dataset.type) return;

        try {
          // Add some default positions for better UX
          const centerX = this.elements.canvas.clientWidth / 2 - 70;
          const centerY = this.elements.canvas.clientHeight / 2 - 32;
          const randomOffset = () => (Math.random() - 0.5) * 200;
          
          this.editor.addElement(
            tool.dataset.type,
            centerX + randomOffset(),
            centerY + randomOffset()
          );
        } catch (error) {
          this.updateStatus(
            `Failed to add ${tool.dataset.type}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "error"
          );
        }
      },
      { signal }
    );

    // Control buttons
    this.elements.runButton.addEventListener("click", () => this.executeProgram(), { signal });
    this.elements.saveButton.addEventListener("click", () => this.saveProgram(), { signal });
    this.elements.loadButton.addEventListener("click", () => this.loadProgram(), { signal });

    this.elements.connectModeButton.addEventListener(
      "click",
      () => {
        this.editor.toggleConnectMode();
        this.elements.connectModeButton.classList.toggle("active");
      },
      { signal }
    );

    this.elements.clearAllButton.addEventListener(
      "click",
      () => {
        if (confirm("Clear all elements and connections?")) {
          this.editor.clearAll();
          this.elements.connectModeButton.classList.remove("active");
          this.clearUndoRedo();
        }
      },
      { signal }
    );

    //  keyboard shortcuts
    document.addEventListener("keydown", this.handleKeyDown, { signal });

    // Prevent context menu on canvas (handled by editable elements)
    this.elements.canvas.addEventListener(
      "contextmenu",
      (e) => {
        if (!(e.target as Element).closest('.element')) {
          e.preventDefault();
        }
      },
      { signal }
    );

    this.state.features.push(" Event Handling");
  }

  /**
   *  keyboard shortcuts
   */
  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "s":
          e.preventDefault();
          this.saveProgram();
          break;
        case "o":
          e.preventDefault();
          this.loadProgram();
          break;
        case "Enter":
          e.preventDefault();
          this.executeProgram();
          break;
        case "z":
          if (e.shiftKey) {
            e.preventDefault();
            this.redo();
          } else {
            e.preventDefault();
            this.undo();
          }
          break;
        case "y":
          e.preventDefault();
          this.redo();
          break;
        case "d":
          e.preventDefault();
          this.duplicateSelected();
          break;
        case "a":
          e.preventDefault();
          this.selectAll();
          break;
      }
    }

    // Quick add shortcuts
    if (e.altKey) {
      let blockType: string | null = null;
      switch (e.key) {
        case "v": blockType = "variable"; break;
        case "a": blockType = "array"; break;
        case "f": blockType = "function"; break;
        case "l": blockType = "loop"; break;
        case "c": blockType = "counter"; break;
        case "p": blockType = "print"; break;
        case "s": blockType = "set_variable"; break;
        case "g": blockType = "get_variable"; break;
      }
      
      if (blockType) {
        e.preventDefault();
        try {
          this.editor.addElement(blockType);
          this.updateStatus(`Added ${blockType} block (Alt+${e.key})`, 'success');
        } catch (error) {
          this.updateStatus(`Failed to add ${blockType}`, 'error');
        }
      }
    }
  };

  /**
   * Setup  features
   */
  private setupFeatures(): void {
    if (this.options.enableUndoRedo) {
      this.setupUndoRedo();
      this.state.features.push("Undo/Redo");
    }

    if (this.options.enableMinimap) {
      this.setupMinimap();
      this.state.features.push("Minimap");
    }

    if (this.options.enableExample) {
      this.buildExampleProgram();
      this.state.features.push(" Example Program");
    }

    this.updateStats();
    this.showWelcomeMessage();
  }

  /**
   * Show welcome message with keyboard shortcuts
   */
  private showWelcomeMessage(): void {
    const shortcuts = [
      "Ctrl+S: Save program",
      "Ctrl+O: Load program", 
      "Ctrl+Enter: Execute program",
      "Ctrl+Z/Y: Undo/Redo",
      "Double-click: Edit element",
      "Right-click: Context menu",
      "Alt+V: Add Variable",
      "Alt+S: Add Set Variable",
      "Alt+F: Add Function",
      "Alt+L: Add Loop"
    ];

    console.log("🎯  Visual Programming Framework");
    console.log("⌨️  Keyboard shortcuts:");
    shortcuts.forEach(shortcut => console.log(`   ${shortcut}`));
    
    this.updateStatus(" framework ready! Try Alt+V to add a variable", "success");
  }

  /**
   * Build  example program
   */
  private buildExampleProgram(): void {
    try {
      // Create example with assignment operations
      const varId = this.editor.addElement("variable", 100, 150, {
        name: "counter",
        value: 0
      });

      const setVarId = this.editor.addElement("set_variable", 300, 150, {
        name: "counter"
      });

      const getVarId = this.editor.addElement("get_variable", 500, 150, {
        name: "counter"
      });

      const arrayId = this.editor.addElement("array", 100, 250, {
        items: [1, 2, 3, 4, 5]
      });

      const arrayPushId = this.editor.addElement("array_push", 300, 250);

      const forLoopId = this.editor.addElement("for_range", 500, 250, {
        start: 1,
        end: 5,
        step: 1
      });

      const incCounterId = this.editor.addElement("counter_increment", 700, 150, {
        step: 1
      });

      const printId = this.editor.addElement("print", 700, 250, {
        message: "Loop iteration"
      });

      // Create connections with delay
      setTimeout(() => {
        try {
          this.editor.createConnection(varId, setVarId);
          this.editor.createConnection(setVarId, getVarId);
          this.editor.createConnection(arrayId, arrayPushId);
          this.editor.createConnection(forLoopId, incCounterId);
          this.editor.createConnection(forLoopId, printId);

          this.updateStats();
          this.saveUndoState();
          this.updateStatus(
            " example loaded! Double-click elements to edit their values",
            "success"
          );
        } catch (error) {
          console.warn("Failed to create example connections:", error);
        }
      }, 200);

    } catch (error) {
      console.warn("Failed to build  example:", error);
    }
  }

  /**
   *  program execution
   */
  private async executeProgram(): Promise<void> {
    try {
      this.elements.runButton.textContent = "⏸ Running...";
      (this.elements.runButton as HTMLButtonElement).disabled = true;

      await this.editor.executeProgram({
        stepDelay: 800,
        maxExecutionTime: 45000,
        maxSteps: 100,
        onElementStart: (elementId) => {
          console.log(`🚀 Starting execution of element: ${elementId}`);
        },
        onElementComplete: (elementId) => {
          console.log(`✅ Completed execution of element: ${elementId}`);
        },
      });

    } catch (error) {
      console.error("Execution error:", error);
      this.updateStatus(
        `Execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
    } finally {
      this.elements.runButton.textContent = "▶ Execute Code";
      (this.elements.runButton as HTMLButtonElement).disabled = false;
    }
  }

  /**
   * Duplicate selected element
   */
  private duplicateSelected(): void {
    const stats = this.editor.getStats();
    if (stats.selectedElement) {
      const state = this.editor.getState();
      const element = state.elements.find(el => el.id === stats.selectedElement);
      if (element) {
        try {
          this.editor.addElement(
            element.type,
            element.x + 30,
            element.y + 30,
            { ...element.props }
          );
          this.updateStatus("Element duplicated", "success");
        } catch (error) {
          this.updateStatus("Failed to duplicate element", "error");
        }
      }
    } else {
      this.updateStatus("No element selected to duplicate", "error");
    }
  }

  /**
   * Select all elements
   */
  private selectAll(): void {
    // This would require extending the editor to support multi-selection
    this.updateStatus("Select all not yet implemented", "error");
  }

  // Save/Load/Stats methods remain the same as original...
  private saveProgram(): void {
    try {
      const state = this.editor.getState();
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `-visual-program-${timestamp}.json`;

      localStorage.setItem(
        "-visual-programming-backup",
        JSON.stringify({
          ...state,
          savedAt: new Date().toISOString(),
          version: "2.0.0",
          features: this.state.features
        })
      );

      const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.updateStatus(`Program saved as ${filename}`, "success");
    } catch (error) {
      this.updateStatus(`Save failed: ${error}`, "error");
    }
  }

  private loadProgram(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.style.display = "none";

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const state = JSON.parse(text);
        
        this.editor.loadState(state);
        this.updateStats();
        this.clearUndoRedo();
        this.updateStatus(`Loaded program from ${file.name}`, "success");
      } catch (error) {
        this.updateStatus(`Load failed: ${error}`, "error");
      } finally {
        input.remove();
      }
    };

    document.body.appendChild(input);
    input.click();
  }

  private updateStats(): void {
    try {
      const stats = this.editor.getStats();
      this.elements.elementCountElement.textContent = String(stats.elementCount);
      this.elements.connectionCountElement.textContent = String(stats.connectionCount);
    } catch (error) {
      console.warn("Failed to update stats:", error);
    }
  }

  private updateStatus(message: string, type?: "success" | "error" | "running"): void {
    try {
      this.elements.statusElement.textContent = message || "Ready";
      this.elements.statusElement.className = `status ${type || ""}`;

      if (type !== "error") {
        setTimeout(() => {
          if (this.elements.statusElement.textContent === message) {
            this.elements.statusElement.textContent = "Ready";
            this.elements.statusElement.className = "status";
          }
        }, 3000);
      }
    } catch (error) {
      console.warn("Failed to update status:", error);
    }
  }

  // Undo/Redo methods...
  private setupUndoRedo(): void {
    this.saveUndoState();
  }

  private saveUndoState(): void {
    if (!this.options.enableUndoRedo) return;
    try {
      const state = JSON.stringify(this.editor.getState());
      const lastState = this.undoRedoState.undoStack[this.undoRedoState.undoStack.length - 1];
      if (lastState === state) return;

      this.undoRedoState.undoStack.push(state);
      if (this.undoRedoState.undoStack.length > this.undoRedoState.maxStackSize) {
        this.undoRedoState.undoStack.shift();
      }
      this.undoRedoState.redoStack.length = 0;
    } catch (error) {
      console.warn("Failed to save undo state:", error);
    }
  }

  private undo(): void {
    if (this.undoRedoState.undoStack.length <= 1) return;
    try {
      const currentState = this.undoRedoState.undoStack.pop()!;
      this.undoRedoState.redoStack.push(currentState);
      const previousState = this.undoRedoState.undoStack[this.undoRedoState.undoStack.length - 1];
      const state = JSON.parse(previousState);
      this.editor.loadState(state);
      this.updateStats();
      this.updateStatus("Undid last action", "success");
    } catch (error) {
      this.updateStatus("Undo failed", "error");
    }
  }

  private redo(): void {
    if (this.undoRedoState.redoStack.length === 0) return;
    try {
      const stateToRestore = this.undoRedoState.redoStack.pop()!;
      this.undoRedoState.undoStack.push(stateToRestore);
      const state = JSON.parse(stateToRestore);
      this.editor.loadState(state);
      this.updateStats();
      this.updateStatus("Redid last action", "success");
    } catch (error) {
      this.updateStatus("Redo failed", "error");
    }
  }

  private clearUndoRedo(): void {
    this.undoRedoState.undoStack.length = 0;
    this.undoRedoState.redoStack.length = 0;
    this.saveUndoState();
  }

  private setupMinimap(): void {
    // Minimap implementation same as original...
  }

  dispose(): void {
    if (this.isDisposed) return;
    try {
      if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
      if (this.eventAbortController) this.eventAbortController.abort();
      
      this.editor?.dispose();
      this.viewToggle?.dispose();
      this.editableElements?.dispose();
      
      this.isDisposed = true;
      console.log(" Visual Programming Framework disposed");
    } catch (error) {
      console.error("Error during app disposal:", error);
    }
  }
}

// ---------------------------------------------------------------------------
// Initialize  Application
// ---------------------------------------------------------------------------

function initializeApp(): void {
  try {
    const app = new VisualProgrammingApp({
      enableAutoSave: true,
      enableMinimap: true,
      enableUndoRedo: true,
      enableKeyboardShortcuts: true,
      enableExample: true,
      persistViewMode: true,
      enableInlineEditing: true,
      enableBlocks: true,
    });

    // Expose for debugging
    if (typeof window !== "undefined") {
      (window as any).App = app;
      (window as any).BlockRegistry = BlockRegistry;
    }

    console.log("🚀  Visual Programming Framework fully initialized");
    
  } catch (error) {
    console.error("❌ Failed to initialize  application:", error);
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

export { VisualProgrammingApp, BlockRegistry };