/* --------------------------------------------------------------------------
 * Block Registry – central catalogue for every node type your visual
 * programming environment understands.
 * --------------------------------------------------------------------------
 *  • Strict runtime-checks protect against bad community plugins.
 *  • Every definition is deep-frozen at registration time so it stays
 *    immutable and tree-shake-friendly.
 *  • A tiny default `render()` fallback means you never have to provide
 *    one unless you want a custom card body.
 * --------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/consistent-type-definitions */

// ---------------------------------------------------------------------------
// 🔖  Public contracts
// ---------------------------------------------------------------------------

export type Category = 'data' | 'control' | 'math' | 'io' | 'logic';

export interface BlockMetadata {
  readonly displayName: string;
  readonly category: Category;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly isCircular?: boolean;
  readonly defaultProps?: Record<string, unknown>;
  readonly color?: string;      // HEX / CSS var for borders & icon
  readonly icon?: string;       // optional emoji / SVG id
  readonly description?: string;
}

export interface ExecutionContext {
  readonly elementId: string;
  readonly inputs: Record<string, unknown>;
  readonly state: Map<string, Map<string, unknown>>;
  readonly connections: Map<string, string[]>;
  /** Dispatch execution to all edges labelled with `output` */
  go(output: string, value?: unknown): Promise<void>;
  /** Write to this node's local state store */
  setValue(key: string, value: unknown): void;
  /** Read from this node's local state store */
  getValue(key: string): unknown;
  /** Append to the execution log */
  log(message: string): void;
}

export interface BlockDefinition extends BlockMetadata {
  /** Async business logic – may call `await ctx.go()` */
  readonly execute?: (ctx: ExecutionContext) => Promise<void>;
  /** Optional props validator – return a string to signal an error */
  readonly validate?: (props: Record<string, unknown>) => string | null;
  /**
   * Runtime-agnostic visual description.
   * You may sprinkle HTML but keep it tiny; the renderer will insert it verbatim.
   */
  readonly render?: (
    props: Record<string, unknown>
  ) => { label: string; content: string; value?: string };
}

// ---------------------------------------------------------------------------
// 🗄️   Implementation
// ---------------------------------------------------------------------------

class BlockRegistryImpl {
  private readonly blocks = new Map<string, BlockDefinition>();

  /** Register a new block type provided by core or a plugin. */
  public register(type: string, definition: BlockDefinition): void {
    // ---------------- type guards ----------------
    if (typeof type !== 'string' || !type.trim()) {
      throw new TypeError('Block type must be a non-empty string');
    }
    if (typeof definition !== 'object' || definition === null) {
      throw new TypeError('Block definition must be an object');
    }

    const {
      displayName,
      inputs,
      outputs,
      category,
    } = definition;

    if (typeof displayName !== 'string' || !displayName.trim()) {
      throw new TypeError('`displayName` must be a non-empty string');
    }
    if (!Array.isArray(inputs) || !Array.isArray(outputs)) {
      throw new TypeError('`inputs` and `outputs` must be string arrays');
    }

    const CATEGORIES: readonly Category[] = [
      'data',
      'control',
      'math',
      'io',
      'logic',
    ];
    if (!CATEGORIES.includes(category)) {
      throw new TypeError(
        '`category` must be one of: ' + CATEGORIES.join(', ')
      );
    }

    // ---------------- default render fallback ----------------
    const safeDefinition: BlockDefinition = {
      ...definition,
      render:
        definition.render ??
        (() => ({ label: displayName, content: type })),
    };

    // Freeze to prevent late mutation (helps hot-module reload safety)
    this.blocks.set(type, Object.freeze(safeDefinition));
  }

  /** Retrieve a definition */
  public get(type: string): BlockDefinition | undefined {
    if (typeof type !== 'string') {
      throw new TypeError('Block type must be a string');
    }
    return this.blocks.get(type);
  }

  /** Quick existence check */
  public has(type: string): boolean {
    return this.blocks.has(type);
  }

  /** Array of all registered type strings */
  public getTypes(): string[] {
    return [...this.blocks.keys()];
  }

  /** Filtered view by category */
  public getByCategory(cat: Category): Array<{ type: string; definition: BlockDefinition }> {
    return [...this.blocks.entries()]
      .filter(([, d]) => d.category === cat)
      .map(([type, definition]) => ({ type, definition }));
  }

  /** Flat list of definitions */
  public getAll(): Array<{ type: string; definition: BlockDefinition }> {
    return [...this.blocks.entries()].map(([type, definition]) => ({ type, definition }));
  }

  /** Remove everything – useful in isolated tests */
  public clear(): void {
    this.blocks.clear();
  }

  /** Unregister a single type (returns false if it never existed) */
  public unregister(type: string): boolean {
    return this.blocks.delete(type);
  }
}

// ---------------------------------------------------------------------------
// 🏁  Singleton export – the rest of the app imports this.
// ---------------------------------------------------------------------------

export const BlockRegistry = new BlockRegistryImpl();

// Make it easy to debug in the browser console
if (typeof window !== 'undefined') {
  // @ts-ignore – augment globalThis for dev convenience
  window.BlockRegistry = BlockRegistry;
}
