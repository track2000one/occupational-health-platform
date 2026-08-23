import { useEffect, useRef } from 'react';
import { useDatePreference } from '../context/DatePreferenceContext';

const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG', 'PATH']);

function shouldSkipNode(node: Node) {
  const parent = node.parentElement;
  if (!parent) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  return Boolean(parent.closest('[data-date-skip="true"]'));
}

export function DateCalendarDomFormatter() {
  const { calendar, formatDate } = useDatePreference();
  const originals = useRef(new WeakMap<Text, string>());

  useEffect(() => {
    function formatTextNode(node: Text) {
      if (shouldSkipNode(node)) return;
      const currentText = node.textContent || '';
      const originalText = originals.current.get(node) || currentText;
      if (!ISO_DATE_PATTERN.test(originalText)) return;
      ISO_DATE_PATTERN.lastIndex = 0;
      originals.current.set(node, originalText);
      node.textContent = originalText.replace(ISO_DATE_PATTERN, match => formatDate(match));
    }

    function scan(root: Node) {
      if (root.nodeType === Node.TEXT_NODE) {
        formatTextNode(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        formatTextNode(node as Text);
        node = walker.nextNode();
      }
    }

    scan(document.body);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(scan);
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          formatTextNode(mutation.target as Text);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [calendar, formatDate]);

  return null;
}
