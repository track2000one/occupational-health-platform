import { useEffect, useRef } from 'react';
import { useDatePreference } from '../context/DatePreferenceContext';

const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const HAS_ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/;
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
      if (!HAS_ISO_DATE_PATTERN.test(originalText)) return;
      originals.current.set(node, originalText);
      const formattedText = originalText.replace(ISO_DATE_PATTERN, match => formatDate(match));

      // MutationObserver sees writes performed by this formatter too. Writing the
      // same value again creates another characterData mutation and previously
      // caused an endless callback loop whenever a newly saved row contained an
      // ISO date. Only update the node when the rendered value actually changes.
      if (currentText !== formattedText) {
        node.textContent = formattedText;
      }
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
