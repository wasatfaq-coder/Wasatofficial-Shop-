/**
 * Safe clipboard copying with modern API and iframe/fallback support.
 * Prevents unhandled promise rejections in sandboxed iframes.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Modern Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for sandboxed iframes or unfocused documents
    }
  }

  // Fallback via temporary textarea element
  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      textArea.style.left = '-9999px';
      textArea.style.opacity = '0';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand('copy');
      if (textArea.parentNode) {
        textArea.parentNode.removeChild(textArea);
      }
      return success;
    } catch {
      return false;
    }
  }

  return false;
}
