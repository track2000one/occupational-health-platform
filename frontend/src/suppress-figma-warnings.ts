// Figma Make's FGCmp inspector injects data-fg-* / data-fgid-* props onto every
// React component in the tree, including third-party ones like MUI ThemeProvider.
// This file suppresses the resulting false-positive prop-type warnings.
// It is imported once at the very top of main.tsx so it runs before any component mounts.
if (typeof console !== 'undefined') {
  const _orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const joined = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
    if (joined.includes('data-fg') || joined.includes('data-fgid')) return;
    // recharts iterates Cell/Bar children internally via React.Children.map which
    // strips keys before passing them to ForwardRef wrappers — not fixable from userland.
    if (joined.includes('unique') && joined.includes('key') && joined.includes('ForwardRef')) return;
    _orig(...args);
  };
}
