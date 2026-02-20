/**
 * DOM Scanner — extracts form fields and buttons from the current page.
 *
 * Produces a PageSnapshot that the Strands agent uses to understand the
 * form layout and decide what to fill. Each element gets a unique ref ID
 * that the agent uses in fill_field and click_element commands.
 */

export interface ScannedField {
  ref: string;
  tag: string;
  type: string;
  label: string;
  name: string;
  value: string;
  placeholder: string;
  required: boolean;
  options: string[];
  checked: boolean | null;
}

export interface ScannedButton {
  ref: string;
  text: string;
  type: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  fields: ScannedField[];
  buttons: ScannedButton[];
}

const refMap = new Map<string, HTMLElement>();

export function getElementByRef(ref: string): HTMLElement | null {
  return refMap.get(ref) ?? null;
}

export function scanPage(): PageSnapshot {
  refMap.clear();

  const fields: ScannedField[] = [];
  const buttons: ScannedButton[] = [];
  let fieldIdx = 0;
  let buttonIdx = 0;

  const formElements = document.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input, select, textarea');

  for (const el of formElements) {
    if (!isVisible(el) || isHiddenInput(el)) continue;

    const ref = `f${fieldIdx++}`;
    refMap.set(ref, el);

    const field: ScannedField = {
      ref,
      tag: el.tagName.toLowerCase(),
      type: getFieldType(el),
      label: findLabel(el),
      name: el.name || '',
      value: getFieldValue(el),
      placeholder: (el as HTMLInputElement).placeholder || '',
      required: el.required,
      options: [],
      checked: null,
    };

    if (el instanceof HTMLSelectElement) {
      field.options = Array.from(el.options)
        .filter((opt) => opt.value !== '')
        .map((opt) => opt.text.trim());
    }

    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      field.checked = el.checked;
    }

    fields.push(field);
  }

  const buttonElements = document.querySelectorAll<HTMLElement>(
    'button, input[type="submit"], input[type="button"], [role="button"]',
  );

  for (const el of buttonElements) {
    if (!isVisible(el)) continue;
    const text = getButtonText(el);
    if (!text) continue;

    const ref = `b${buttonIdx++}`;
    refMap.set(ref, el);
    buttons.push({
      ref,
      text,
      type: el instanceof HTMLButtonElement ? el.type || 'button' : 'button',
    });
  }

  const linkButtons = document.querySelectorAll<HTMLAnchorElement>(
    'a[class*="btn"], a[class*="button"], a[class*="Button"], a[class*="next"], a[class*="submit"]',
  );

  for (const el of linkButtons) {
    if (!isVisible(el)) continue;
    const text = el.textContent?.trim();
    if (!text) continue;

    const ref = `b${buttonIdx++}`;
    refMap.set(ref, el);
    buttons.push({ ref, text, type: 'link' });
  }

  return {
    url: window.location.href,
    title: document.title,
    fields,
    buttons,
  };
}

export function fillFieldByRef(ref: string, value: string): { ok: boolean; error?: string } {
  const el = refMap.get(ref);
  if (!el) return { ok: false, error: `Element ${ref} not found` };

  try {
    if (el instanceof HTMLSelectElement) return fillSelect(el, value);
    if (el instanceof HTMLTextAreaElement) return fillTextInput(el, value);

    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox') {
        const shouldCheck = ['true', 'yes', '1'].includes(value.toLowerCase());
        if (el.checked !== shouldCheck) el.click();
        return { ok: true };
      }
      if (el.type === 'radio') {
        if (!el.checked) el.click();
        return { ok: true };
      }
      if (el.type === 'file') {
        return { ok: false, error: 'Cannot programmatically fill file inputs' };
      }
      return fillTextInput(el, value);
    }

    if ('value' in el) {
      (el as HTMLInputElement).value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    }

    return { ok: false, error: `Cannot fill element type: ${el.tagName}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export function clickElementByRef(ref: string): { ok: boolean; error?: string } {
  const el = refMap.get(ref);
  if (!el) return { ok: false, error: `Element ${ref} not found` };

  try {
    el.click();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null && el.style.position !== 'fixed') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

function isHiddenInput(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement && el.type === 'hidden';
}

function getFieldType(el: HTMLElement): string {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLInputElement) return el.type || 'text';
  return 'unknown';
}

function getFieldValue(el: HTMLElement): string {
  if (el instanceof HTMLSelectElement) {
    const selected = el.options[el.selectedIndex];
    return selected?.value ? selected.text.trim() : '';
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return '';
}

function findLabel(el: HTMLElement): string {
  const id = el.id;
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (label) return label.textContent?.trim() || '';
  }

  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea').forEach((child) => child.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent?.trim() || '';
  }

  const prev = el.previousElementSibling;
  if (prev && prev.tagName !== 'INPUT' && prev.tagName !== 'SELECT') {
    const text = prev.textContent?.trim();
    if (text && text.length < 100) return text;
  }

  if (el instanceof HTMLInputElement && el.placeholder) return el.placeholder;
  if (el instanceof HTMLInputElement && el.name) {
    return el.name.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  return '';
}

function getButtonText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) return el.value || '';
  const text = el.textContent?.trim();
  if (text) return text;
  return el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim() || '';
}

function fillTextInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): { ok: boolean; error?: string } {
  el.focus();
  el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return { ok: true };
}

function fillSelect(el: HTMLSelectElement, value: string): { ok: boolean; error?: string } {
  const valueLower = value.toLowerCase().trim();
  let bestMatch: HTMLOptionElement | null = null;

  for (const opt of Array.from(el.options)) {
    const optText = opt.text.trim().toLowerCase();
    const optValue = opt.value.toLowerCase();

    if (optText === valueLower || optValue === valueLower) {
      bestMatch = opt;
      break;
    }
    if (!bestMatch && (optText.includes(valueLower) || valueLower.includes(optText))) {
      bestMatch = opt;
    }
  }

  if (!bestMatch) {
    const available = Array.from(el.options)
      .filter((o) => o.value !== '')
      .map((o) => o.text.trim())
      .join(', ');
    return { ok: false, error: `No matching option for "${value}". Available: ${available}` };
  }

  el.value = bestMatch.value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}
