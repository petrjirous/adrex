import css from './styles.css?inline';

interface AddressSuggestion {
  isWholeAddress: boolean;
  values: Record<string, string>;
  addressDetail?: any;
}

interface AutocompleteResponse {
  suggestions: AddressSuggestion[];
  query: string;
  totalHits: number;
  processingTimeMs: number;
}

type AdrexTheme = 'light' | 'dark' | 'none';

interface AdrexOptions {
  apiUrl?: string;
  apiKey?: string;
  debounce?: number;
  minChars?: number;
  maxSuggestions?: number;
  theme?: AdrexTheme;
  zIndex?: number;
  onSelect?: (suggestion: AddressSuggestion, instance: AdrexInstance) => void;
  onSuggest?: (suggestions: AddressSuggestion[], query: string, instance: AdrexInstance) => void;
  onError?: (error: unknown, instance: AdrexInstance) => void;
  renderSuggestion?: (suggestion: AddressSuggestion, query: string) => string;
  renderEmpty?: () => string;
  noResultsText?: string;
}

interface AdrexResolvedOptions {
  apiUrl: string;
  apiKey: string | null;
  debounce: number;
  minChars: number;
  maxSuggestions: number;
  theme: AdrexTheme;
  zIndex: number;
  onSelect: ((suggestion: AddressSuggestion, instance: AdrexInstance) => void) | null;
  onSuggest: ((suggestions: AddressSuggestion[], query: string, instance: AdrexInstance) => void) | null;
  onError: ((error: unknown, instance: AdrexInstance) => void) | null;
  renderSuggestion: ((suggestion: AddressSuggestion, query: string) => string) | null;
  renderEmpty: (() => string) | null;
  noResultsText: string;
}

interface AdrexConfig {
  apiUrl: string;
  apiKey: string | null;
  globalOptions: AdrexOptions;
  beforeInit: (() => void) | null;
  afterInit: (() => void) | null;
}

const config: AdrexConfig = {
  apiUrl: '',
  apiKey: null,
  globalOptions: {},
  beforeInit: null,
  afterInit: null,
};

const DEFAULT_OPTIONS: AdrexResolvedOptions = {
  apiUrl: '',
  apiKey: null,
  debounce: 250,
  minChars: 2,
  maxSuggestions: 8,
  theme: 'light',
  zIndex: 10000,
  onSelect: null,
  onSuggest: null,
  onError: null,
  renderSuggestion: null,
  renderEmpty: null,
  noResultsText: 'Adresa nenalezena',
};

const instances: Record<string, AdrexInstance> = {};
let defaultInstance: AdrexInstance | null = null;

let stylesInjected = false;
let domReady = document.readyState !== 'loading';

function injectStylesIfNeeded(theme: AdrexTheme) {
  if (theme === 'none' || stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  stylesInjected = true;
}

function updateThemeAttribute(theme: AdrexTheme) {
  if (theme === 'none') return;
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-adrex-theme', 'dark');
    return;
  }

  if (theme === 'light') {
    document.documentElement.setAttribute('data-adrex-theme', 'light');
    return;
  }
}

function debounce<Args extends unknown[]>(func: (...args: Args) => unknown, wait: number): (...args: Args) => void {
  let timeout: number | null = null;
  return function(...args: Args) {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      func(...args);
    }, wait);
  };
}

function resolveOptions(instance?: AdrexInstance): AdrexResolvedOptions {
  const instanceOptions = instance?.options ?? {};
  const globalOptions = config.globalOptions;

  return {
    apiUrl: instanceOptions.apiUrl ?? globalOptions.apiUrl ?? config.apiUrl ?? DEFAULT_OPTIONS.apiUrl,
    apiKey: instanceOptions.apiKey ?? globalOptions.apiKey ?? config.apiKey ?? DEFAULT_OPTIONS.apiKey,
    debounce: instanceOptions.debounce ?? globalOptions.debounce ?? DEFAULT_OPTIONS.debounce,
    minChars: instanceOptions.minChars ?? globalOptions.minChars ?? DEFAULT_OPTIONS.minChars,
    maxSuggestions: instanceOptions.maxSuggestions ?? globalOptions.maxSuggestions ?? DEFAULT_OPTIONS.maxSuggestions,
    theme: instanceOptions.theme ?? globalOptions.theme ?? DEFAULT_OPTIONS.theme,
    zIndex: instanceOptions.zIndex ?? globalOptions.zIndex ?? DEFAULT_OPTIONS.zIndex,
    onSelect: instanceOptions.onSelect ?? globalOptions.onSelect ?? DEFAULT_OPTIONS.onSelect,
    onSuggest: instanceOptions.onSuggest ?? globalOptions.onSuggest ?? DEFAULT_OPTIONS.onSuggest,
    onError: instanceOptions.onError ?? globalOptions.onError ?? DEFAULT_OPTIONS.onError,
    renderSuggestion: instanceOptions.renderSuggestion ?? globalOptions.renderSuggestion ?? DEFAULT_OPTIONS.renderSuggestion,
    renderEmpty: instanceOptions.renderEmpty ?? globalOptions.renderEmpty ?? DEFAULT_OPTIONS.renderEmpty,
    noResultsText: instanceOptions.noResultsText ?? globalOptions.noResultsText ?? DEFAULT_OPTIONS.noResultsText,
  };
}

function mergeGlobalOptions(options: AdrexOptions) {
  config.globalOptions = { ...config.globalOptions, ...options };
  if (Object.prototype.hasOwnProperty.call(options, 'apiKey')) {
    config.apiKey = options.apiKey ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'apiUrl') && options.apiUrl) {
    config.apiUrl = options.apiUrl.replace(/\/$/, '');
  }
}

function getOrCreateInstance(instanceId?: string): AdrexInstance {
  if (!instanceId || instanceId === 'default') {
    if (!defaultInstance) defaultInstance = new AdrexInstance('default');
    return defaultInstance;
  }
  if (!instances[instanceId]) instances[instanceId] = new AdrexInstance(instanceId);
  return instances[instanceId];
}

class AdrexInstance {
  id: string;
  inputs: HTMLInputElement[] = [];
  activeInput: HTMLInputElement | null = null;
  dropdown: HTMLElement | null = null;
  suggestions: AddressSuggestion[] = [];
  selectedIndex: number = -1;
  options: AdrexOptions = {};
  private debouncedFetch?: (val: string, input: HTMLInputElement) => void;
  private teardownCallbacks: Array<() => void> = [];

  constructor(id: string) {
    this.id = id;
  }

  configure(options: AdrexOptions) {
    this.options = { ...this.options, ...options };
    this.debouncedFetch = undefined;
  }

  resetDebounce() {
    this.debouncedFetch = undefined;
  }

  addInput(input: HTMLInputElement) {
    if (this.inputs.includes(input)) return;
    this.inputs.push(input);
    this.attachListeners(input);
  }

  open() {
    const input = this.activeInput ?? this.inputs[0] ?? null;
    if (!input) return;
    this.activeInput = input;
    this.renderDropdown(input, input.value);
  }

  close() {
    this.closeDropdown();
  }

  destroy() {
    this.closeDropdown();
    this.teardownCallbacks.forEach((teardown) => teardown());
    this.teardownCallbacks = [];
    this.inputs = [];
    this.activeInput = null;
    this.suggestions = [];
    this.selectedIndex = -1;
  }

  search(query: string) {
    const input = this.activeInput ?? this.inputs[0] ?? null;
    if (!input) return;
    const options = resolveOptions(this);
    this.activeInput = input;
    input.value = query;
    if (query.length < options.minChars) {
      this.closeDropdown();
      return;
    }
    this.fetchSuggestions(query, input);
  }

  hasSuggestions() {
    return this.suggestions.length > 0;
  }

  private getDebouncedFetch() {
    if (!this.debouncedFetch) {
      const options = resolveOptions(this);
      this.debouncedFetch = debounce((val: string, input: HTMLInputElement) => this.fetchSuggestions(val, input), options.debounce);
    }
    return this.debouncedFetch;
  }

  private attachListeners(input: HTMLInputElement) {
    const onInput = (e: Event) => {
      const val = (e.target as HTMLInputElement).value;
      const options = resolveOptions(this);
      if (val.length >= options.minChars) {
        this.getDebouncedFetch()(val, input);
      } else {
        this.closeDropdown();
      }
    };

    const onKeydown = (e: KeyboardEvent) => this.handleKeydown(e);
    const onFocus = () => {
      this.activeInput = input;
    };

    const onClickOutside = (e: MouseEvent) => {
      if (this.dropdown && !this.dropdown.contains(e.target as Node) && e.target !== input) {
        this.closeDropdown();
      }
    };

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    input.addEventListener('focus', onFocus);
    document.addEventListener('click', onClickOutside);

    this.teardownCallbacks.push(() => {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeydown);
      input.removeEventListener('focus', onFocus);
      document.removeEventListener('click', onClickOutside);
    });
  }

  private async fetchSuggestions(query: string, input: HTMLInputElement) {
    const options = resolveOptions(this);
    if (!options.apiKey) {
      console.warn('Adrex: apiKey not set. Call adrex.setClientId() or adrex.configure({ apiKey })');
      return;
    }
    if (!options.apiUrl) {
      console.warn('Adrex: apiUrl not set. Provide data-adrex-url or adrex.configure({ apiUrl })');
      return;
    }

    this.activeInput = input;

    try {
      const response = await fetch(`${options.apiUrl}/api/v1/address/autocomplete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`
        },
        body: JSON.stringify({ query, limit: options.maxSuggestions })
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const data: AutocompleteResponse = await response.json();
      this.suggestions = data.suggestions;
      this.renderDropdown(input, query);
      if (options.onSuggest) {
        options.onSuggest(this.suggestions, query, this);
      }
    } catch (error) {
      console.error('Adrex error:', error);
      if (options.onError) {
        options.onError(error, this);
      }
    }
  }

  private renderDropdown(input: HTMLInputElement, query: string) {
    const options = resolveOptions(this);
    this.closeDropdown();


    const rect = input.getBoundingClientRect();
    const div = document.createElement('div');
    div.className = 'adrex-dropdown';
    div.style.left = `${rect.left + window.scrollX}px`;
    div.style.top = `${rect.bottom + window.scrollY}px`;
    div.style.width = `${rect.width}px`;
    div.style.zIndex = String(options.zIndex);

    if (this.suggestions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'adrex-dropdown-empty';
      if (options.renderEmpty) {
        empty.innerHTML = options.renderEmpty();
      } else {
        empty.textContent = options.noResultsText;
      }
      div.appendChild(empty);
    } else {
      this.suggestions.forEach((suggestion, index) => {
        const item = document.createElement('div');
        item.className = 'adrex-dropdown-item';

        if (options.renderSuggestion) {
          item.innerHTML = options.renderSuggestion(suggestion, query);
        } else {
          const displayText = this.buildDisplayText(suggestion);
          item.innerHTML = this.highlightText(displayText, query);
        }

        item.addEventListener('click', () => {
          this.fillInstance(suggestion);
          this.closeDropdown();
          if (options.onSelect) {
            options.onSelect(suggestion, this);
          }
        });

        item.addEventListener('mouseenter', () => {
          this.selectedIndex = index;
          this.updateActiveItem();
        });

        div.appendChild(item);
      });
    }

    document.body.appendChild(div);
    this.dropdown = div;
    this.selectedIndex = -1;
  }

  private buildDisplayText(suggestion: AddressSuggestion) {
    const displayText = suggestion.values['adrex-whole-address'];
    if (displayText) return displayText;
    const street = suggestion.values['adrex-street'] || '';
    const num = suggestion.values['adrex-number'] || '';
    const city = suggestion.values['adrex-city'] || '';
    const zip = suggestion.values['adrex-zip'] || '';
    return `${street} ${num}, ${zip} ${city}`.trim();
  }

  private highlightText(text: string, query: string): string {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
  }

  private handleKeydown(e: KeyboardEvent) {
    if (!this.dropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.suggestions.length - 1);
      this.updateActiveItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
      this.updateActiveItem();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.selectedIndex >= 0 && this.suggestions[this.selectedIndex]) {
        const suggestion = this.suggestions[this.selectedIndex];
        this.fillInstance(suggestion);
        this.closeDropdown();
        const options = resolveOptions(this);
        if (options.onSelect) {
          options.onSelect(suggestion, this);
        }
      }
    } else if (e.key === 'Escape') {
      this.closeDropdown();
    }
  }

  private updateActiveItem() {
    if (!this.dropdown) return;
    const items = this.dropdown.querySelectorAll('.adrex-dropdown-item');
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add('active');
        (item as HTMLElement).scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  private closeDropdown() {
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
      this.selectedIndex = -1;
      this.activeInput = null;
    }
  }

  private fillInstance(suggestion: AddressSuggestion) {
    const values = suggestion.values;

    this.inputs.forEach(input => {
      for (const className of input.classList) {
        if (values[className]) {
          input.value = values[className];
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
  }
}

function detectApiUrl() {
  const script = document.currentScript as HTMLScriptElement | null;
  if (script) {
    const dataUrl = script.getAttribute('data-adrex-url');
    if (dataUrl) {
      config.apiUrl = dataUrl.replace(/\/$/, '');
      return;
    }
    try {
      const srcUrl = new URL(script.src);
      config.apiUrl = srcUrl.origin;
    } catch (e) {
      config.apiUrl = window.location.origin;
    }
  } else {
    config.apiUrl = window.location.origin;
  }
}

function scanDOM() {
  const inputs = document.querySelectorAll('input[class*="adrex-"]');
  inputs.forEach((input) => {
    const el = input as HTMLInputElement;
    let instanceId = 'default';

    el.classList.forEach(cls => {
      if (cls.startsWith('adrex-instance-')) {
        instanceId = cls.substring('adrex-instance-'.length);
      }
    });

    getOrCreateInstance(instanceId).addInput(el);
  });
}

function applyGlobalConfigSideEffects() {
  const options = resolveOptions();
  if (domReady) {
    injectStylesIfNeeded(options.theme);
    updateThemeAttribute(options.theme);
  } else if (options.theme !== 'none') {
    document.addEventListener('DOMContentLoaded', () => {
      injectStylesIfNeeded(options.theme);
      updateThemeAttribute(options.theme);
    });
  }
}

const adrex = {
  setClientId: (id: string) => {
    config.apiKey = id;
    config.globalOptions = { ...config.globalOptions, apiKey: id };
  },

  configure: (options: AdrexOptions) => {
    mergeGlobalOptions(options);
    if (Object.prototype.hasOwnProperty.call(options, 'debounce')) {
      if (defaultInstance) defaultInstance.resetDebounce();
      Object.values(instances).forEach((instance) => instance.resetDebounce());
    }
    applyGlobalConfigSideEffects();
  },

  beforeInit: null as (() => void) | null,
  afterInit: null as (() => void) | null,

  getInstance: (instanceId?: string): AdrexInstance | null => getOrCreateInstance(instanceId),

  rebindAllForms: (callback?: () => void) => {
    scanDOM();
    if (callback) callback();
  },

  get apiUrl() { return config.apiUrl; },
  set apiUrl(url: string) { config.apiUrl = url; },

  get clientId() { return config.apiKey; }
};

detectApiUrl();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    domReady = true;
    init();
  });
} else {
  domReady = true;
  init();
}

applyGlobalConfigSideEffects();

function init() {
  if (adrex.beforeInit) {
    adrex.beforeInit();
  }

  scanDOM();

  if (adrex.afterInit) {
    adrex.afterInit();
  }
}

export default adrex;
