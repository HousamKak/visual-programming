# Visual Programming Framework

A modular, extensible visual programming framework that supports drag-and-drop programming elements, assignment operations, inline editing, and dual view modes.

## Features

- **🎯 Assignment Operations**: Store and retrieve values with Set/Get Variable blocks
- **🔄 Array Manipulation**: Push, pop, get/set array elements by index
- **📦 Object Properties**: Get and set object properties dynamically
- **➕ Math Assignments**: += and *= operators for efficient value updates
- **🔁 Enhanced Loops**: While loops, for-range loops, and conditional iterations
- **✏️ Inline Editing**: Double-click elements to edit properties in real-time
- **🖱️ Context Menus**: Right-click for duplicate/delete operations
- **🎨 Dual View Modes**: Toggle between detailed card view and compact icon view
- **🔗 Visual Connections**: Drag to connect programming elements
- **⚡ Live Execution**: Run your visual programs with animated flow
- **💾 Save/Load**: Persist programs as JSON files with auto-save
- **⌨️ Keyboard Shortcuts**: Speed up development with comprehensive hotkeys
- **🔄 Undo/Redo**: Full undo/redo support for all operations
- **📱 Responsive**: Works on desktop and tablet devices

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone or create project:**
```bash
mkdir visual-programming
cd visual-programming
```

2. **Create package.json and install dependencies:**
```bash
npm init -y
npm install vite typescript lodash-es --save-dev
npm install
```

3. **Copy all the provided files** to their respective locations:
   - `package.json` (root)
   - `vite.config.ts` (root)
   - `index.html` (root)
   - `src/main.ts`
   - `src/core/registry.ts`
   - `src/core/renderer.ts`
   - `src/core/executor.ts`
   - `src/ui/editor.ts`
   - `src/ui/viewToggle.ts`
   - `src/themes/card.css`
   - `src/themes/icon.css`

4. **Start development server:**
```bash
npm run dev
```

5. **Open browser** to `http://localhost:3000`

## Building for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
/
├── package.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.ts                 # App entry point
    ├── core/
    │   ├── registry.ts         # Block type definitions
    │   ├── renderer.ts         # DOM manipulation
    │   └── executor.ts         # Program execution
    ├── ui/
    │   ├── editor.ts          # Drag & drop + inline editing
    │   └── viewToggle.ts      # View mode switching
    └── themes/
        ├── card.css           # Detailed card view
        └── icon.css           # Compact icon view
```

## Usage

### Basic Operations

1. **Add Elements**: Click buttons in the toolbar to add programming elements
2. **Connect Elements**: Click "Connect" button, then click output → input points
3. **Drag Elements**: Click and drag any element to reposition
4. **Execute Program**: Click "Execute Code" to run your visual program
5. **Toggle Views**: Click "View" button to switch between card/icon modes
6. **Edit Properties**: Double-click any element to edit its properties inline
7. **Context Menu**: Right-click elements for duplicate/delete options

### Keyboard Shortcuts

#### File Operations
- `Ctrl/Cmd + S`: Save program
- `Ctrl/Cmd + O`: Load program
- `Ctrl/Cmd + Enter`: Execute program

#### Editing Operations
- `Ctrl/Cmd + Z`: Undo last action
- `Ctrl/Cmd + Y` or `Ctrl/Cmd + Shift + Z`: Redo action
- `Ctrl/Cmd + D`: Duplicate selected element
- `Delete`: Remove selected element
- `Escape`: Exit connection mode or close dialogs

#### Quick Add Blocks (Alt + Key)
- `Alt + V`: Add Variable
- `Alt + S`: Add Set Variable  
- `Alt + G`: Add Get Variable
- `Alt + A`: Add Array
- `Alt + F`: Add Function
- `Alt + L`: Add Loop
- `Alt + W`: Add While Loop
- `Alt + R`: Add For Range
- `Alt + C`: Add Counter
- `Alt + P`: Add Print
- `Alt + 1-4`: Array operations (push, pop, get, set)
- `Alt + 5-6`: Object operations (get, set)
- `Alt + 7-8`: Counter operations (increment, reset)
- `Alt + 9-0`: Math assignment (add assign, multiply assign)

#### View and Help
- `Ctrl/Cmd + Q`: Toggle toolbar visibility
- `?`: Show help dialog

### Interaction
- **Double-click**: Edit element properties
- **Right-click**: Show context menu
- **Drag**: Move elements around canvas

## Assignment Block Types

### Variable Operations
- **Variable** (`variable`): Creates initial variable declarations
- **Set Variable** (`set_variable`): Assigns values to named variables
- **Get Variable** (`get_variable`): Retrieves variable values by name

### Array Operations
- **Array** (`array`): Creates arrays with initial values
- **Array Push** (`array_push`): Adds elements to the end of an array
- **Array Pop** (`array_pop`): Removes and returns the last element
- **Array Get** (`array_get`): Retrieves element by index
- **Array Set** (`array_set`): Sets element at specific index

### Object Operations
- **Object** (`object`): Creates objects with properties
- **Object Get** (`object_get`): Gets property values from objects
- **Object Set** (`object_set`): Sets object properties

### Math Assignment
- **Add Assign** (`add_assign`): Implements += operation
- **Multiply Assign** (`multiply_assign`): Implements *= operation

### Enhanced Control Flow
- **If Assign** (`if_assign`): Conditional value assignment
- **While Loop** (`while_loop`): Loops while condition is true
- **For Range** (`for_range`): Loops from start to end with step

### String Operations
- **String Concat** (`string_concat`): Concatenates strings with optional separator

### Counter Operations
- **Counter** (`counter`): Basic incrementing counter
- **Counter Increment** (`counter_increment`): Increment by specified step
- **Counter Reset** (`counter_reset`): Reset counter to specific value

## Programming Examples

### Example 1: Variable Assignment and Retrieval
```
1. Add "Variable" block (name: "count", value: 0)
2. Add "Set Variable" block (name: "count") 
3. Add "Get Variable" block (name: "count")
4. Add "Counter Increment" block
5. Connect: Variable → Set Variable → Get Variable → Counter Increment
```

### Example 2: Array Processing Loop
```
1. Add "Array" block with items [1, 2, 3, 4, 5]
2. Add "For Range" loop (start: 0, end: 5, step: 1)
3. Add "Array Get" block 
4. Add "Print" block
5. Connect: Array → Array Get, For Range → Array Get → Print
```

### Example 3: Object Manipulation
```
1. Add "Object" block with properties {name: "test", value: 42}
2. Add "Object Get" block (key: "name")
3. Add "Object Set" block (key: "modified", value: true)
4. Connect: Object → Object Get → Print
5. Connect: Object → Object Set → Print
```

### Example 4: Conditional Assignment
```
1. Add "Variable" block (name: "score", value: 85)
2. Add "Get Variable" block (name: "score")
3. Add "Compare" block (operator: ">=", b: 60)
4. Add "If Assign" block (trueValue: "Pass", falseValue: "Fail")
5. Connect: Variable → Get Variable → Compare → If Assign
```

## Inline Editing System

### Editing Element Properties

1. **Double-click any element** to open the inline editor
2. **Modify values** using appropriate input types:
   - Text fields for strings and names
   - Number inputs for numeric values  
   - Textareas for arrays (JSON format)
   - Checkboxes for boolean values
3. **Save changes** to update the element immediately
4. **Cancel** to discard changes

### Context Menu Options

**Right-click any element** to access:
- **Edit Properties**: Same as double-click
- **Duplicate**: Create a copy with slight offset
- **Delete**: Remove element and all connections

### Property Types

The framework automatically detects property types:
- **String properties**: Text input fields
- **Number properties**: Number input with validation
- **Boolean properties**: Checkbox inputs
- **Array properties**: JSON textarea with syntax validation
- **Object properties**: JSON textarea for complex data

## Architecture Overview

### Enhanced Block Registry

The registry supports advanced block definitions with:
- **Type validation**: Runtime type checking for inputs/outputs
- **Default properties**: Sensible defaults for all block types
- **Execution contexts**: Rich context with state management
- **Render functions**: Dynamic visual representation

### State Management

- **Global State**: Shared variables accessible across blocks via Set/Get Variable
- **Local State**: Block-specific internal state
- **Undo/Redo**: Comprehensive action history
- **Auto-save**: Periodic backup to localStorage

### Type System

```typescript
interface ExecutionContext {
  elementId: string;
  inputs: Record<string, unknown>;
  state: Map<string, Map<string, unknown>>;
  
  // Enhanced methods
  go(output: string, value?: unknown): Promise<void>;
  setValue(key: string, value: unknown): void;
  getValue(key: string): unknown;
  log(message: string): void;
}
```

## Programming Patterns

### Pattern 1: Variable Accumulator
```
Variable(count=0) → Set Variable → While Loop → Get Variable → Add Assign → Set Variable
                      ↑              ↓              ↓            ↓           ↓
                   Update ←── Compare ←──── counter ←──── result ←──── store
```

### Pattern 2: Array Processing Pipeline
```
Array([1,2,3]) → For Range → Array Get → Transform → Array Push → Result Array
```

### Pattern 3: Object Builder
```
Object({}) → Object Set → Object Set → Object Set → Final Object
              ↓name        ↓age        ↓active      ↓
            "John"        25          true        Complete
```

### Pattern 4: Conditional Logic
```
Variable → Get Variable → Compare → If Assign → Print
   ↓            ↓           ↓          ↓         ↓
 value      retrieve    condition   select    output
```

## Configuration Options

### App Options
```typescript
{
  enableAutoSave: true,          // Auto-save every 30s
  enableMinimap: true,           // Show program overview
  enableUndoRedo: true,          // Undo/redo support
  enableInlineEditing: true,     // Double-click editing
  enableKeyboardShortcuts: true, // Keyboard controls
  maxUndoSteps: 50,             // Undo history size
  autoSaveInterval: 30000,      // Auto-save frequency
}
```

### Block Registry Options
```typescript
{
  maxElements: 1000,            // Max blocks on canvas
  maxConnections: 2000,         // Max connections
  gridSize: 16,                 // Snap-to-grid size
  enableValidation: true,       // Runtime type checking
}
```

## Extending the Framework

### Adding Custom Assignment Blocks

```typescript
import { BlockRegistry } from './core/registry.js';

BlockRegistry.register("custom_assign", {
  displayName: "Custom Assignment",
  category: "data",
  inputs: ["target", "operation", "value"],
  outputs: ["result"],
  defaultProps: { operation: "set" },
  
  execute: async (ctx) => {
    const target = ctx.inputs.target;
    const operation = ctx.inputs.operation;
    const value = ctx.inputs.value;
    
    let result;
    switch (operation) {
      case "set": result = value; break;
      case "add": result = target + value; break;
      case "multiply": result = target * value; break;
      default: result = target;
    }
    
    await ctx.go("result", result);
  },
  
  render: (props) => ({
    label: "ASSIGN",
    content: `${props.operation || "set"} operation`
  })
});
```

### Custom Inline Editors

The inline editing system automatically detects property types but can be extended:

```typescript
// Properties are automatically mapped to appropriate editors:
// - string → text input
// - number → number input  
// - boolean → checkbox
// - array → JSON textarea
// - object → JSON textarea
```

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Dependencies

- **Vite**: Build tool and dev server
- **TypeScript**: Type safety and modern JavaScript
- **Lodash-ES**: Utility functions (tree-shakeable)

## Troubleshooting

### Common Issues

**Elements not saving changes:**
- Check that double-click editing is enabled
- Verify the element type supports the property being edited
- Check browser console for validation errors

**Variables not accessible between blocks:**
- Ensure you're using "Set Variable" to store values
- Variable names must match exactly between Set/Get blocks
- Check that blocks are connected in the execution flow

**Array operations failing:**
- Verify input is actually an array type
- Check array indices are within bounds
- Use JSON format for complex array values in inline editor

**Object operations not working:**
- Ensure input is an object type (not array)
- Property keys must be valid strings
- Use JSON format for complex object values

**Execution not flowing properly:**
- Verify all blocks are connected correctly
- Check for cycle detection warnings
- Use step-by-step execution for debugging

### Debug Mode

Access debug information in browser console:
```javascript
// Access global instances
window.VisualProgrammingApp  // Main application
window.BlockRegistry         // Block definitions

// Get execution state
app.getStats()              // App statistics
registry.getStats()         // Registry information
```

## Performance Tips

1. **Limit Array Sizes**: Keep arrays under 1000 elements for optimal performance
2. **Manage Variables**: Clean up unused variables to prevent memory leaks
3. **Connection Optimization**: Minimize unnecessary connections
4. **Execution Limits**: Use maxSteps and maxExecutionTime for safety
5. **Use For Range**: Prefer For Range over While loops when possible

## Roadmap

### v2.1 Planned Features
- [ ] Multi-selection and bulk operations
- [ ] Variable inspector panel
- [ ] Advanced array methods (filter, map, reduce)
- [ ] Function parameters and local scope
- [ ] Template system for common patterns

### v2.2 Planned Features  
- [ ] Collaborative editing support
- [ ] Plugin system for external blocks
- [ ] Advanced data types (dates, regex, etc.)
- [ ] Performance profiling tools
- [ ] Mobile/touch interface improvements
- [ ] Export to JavaScript/Python code

### v3.0 Vision
- [ ] Visual debugger with breakpoints
- [ ] Real-time collaboration
- [ ] Cloud save and sharing
- [ ] Advanced AI assistance
- [ ] Educational curriculum integration

## License

MIT License - feel free to use in your projects!

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality  
4. Submit a pull request with clear description

## Acknowledgments

- TypeScript community for excellent tooling
- Vite for fast development experience
- All contributors and users providing feedback
- Educational programming tools that inspired this framework

---

**Happy Visual Programming! 🚀**

For more information, check out the inline help (press `?`) or explore the example programs included with the framework.