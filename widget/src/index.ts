import css from './styles.css?inline';

// --- Interfaces ---

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

interface AdrexConfig {
  apiUrl: string;
  clientId: string | null;
  beforeInit: (() => void) | null;
  afterInit: (() => void) | null;
}

// --- Global State ---

const config: AdrexConfig = {
  apiUrl: '',
  clientId: null,
  beforeInit: null,
  afterInit: null,
};

const instances: Record<string, AdrexInstance> = {};
let defaultInstance: AdrexInstance | null = null;

// --- CSS Injection ---

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

// --- Debounce Utility ---

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  return function(...args: Parameters<T>) {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      func(...args);
    }, wait);
  };
}

// --- Adrex Instance ---

class AdrexInstance {
  id: string;
  inputs: HTMLInputElement[] = [];
  activeInput: HTMLInputElement | null = null;
  dropdown: HTMLElement | null = null;
  suggestions: AddressSuggestion[] = [];
  selectedIndex: number = -1;

  constructor(id: string) {
    this.id = id;
  }

  addInput(input: HTMLInputElement) {
    if (this.inputs.includes(input)) return;
    this.inputs.push(input);
    this.attachListeners(input);
  }

  attachListeners(input: HTMLInputElement) {
    const debouncedFetch = debounce((val: string) => this.fetchSuggestions(val, input), 250);

    input.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      if (val.length > 0) {
        debouncedFetch(val);
      } else {
        this.closeDropdown();
      }
    });

    input.addEventListener('keydown', (e) => this.handleKeydown(e));
    input.addEventListener('focus', () => {
      // Optional: reopen dropdown if value exists? For now, no.
    });
    
    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
      if (this.dropdown && !this.dropdown.contains(e.target as Node) && e.target !== input) {
        this.closeDropdown();
      }
    });
  }

  async fetchSuggestions(query: string, input: HTMLInputElement) {
    if (!config.clientId) {
      console.warn('Adrex: clientId not set. Call adrex.setClientId()');
      return;
    }

    this.activeInput = input;

    try {
      const response = await fetch(`${config.apiUrl}/api/v1/address/autocomplete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.clientId}`
        },
        body: JSON.stringify({ query, limit: 8 })
      });

      if (!response.ok) throw new Error('Network response was not ok');
      
      const data: AutocompleteResponse = await response.json();
      this.suggestions = data.suggestions;
      this.renderDropdown(input, query);

    } catch (error) {
      console.error('Adrex error:', error);
    }
  }

  renderDropdown(input: HTMLInputElement, query: string) {
    this.closeDropdown();

    const rect = input.getBoundingClientRect();
    const div = document.createElement('div');
    div.className = 'adrex-dropdown';
    div.style.left = `${rect.left + window.scrollX}px`;
    div.style.top = `${rect.bottom + window.scrollY}px`;
    div.style.width = `${rect.width}px`;

    if (this.suggestions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'adrex-dropdown-empty';
      empty.textContent = 'Adresa nenalezena';
      div.appendChild(empty);
    } else {
      this.suggestions.forEach((suggestion, index) => {
        const item = document.createElement('div');
        item.className = 'adrex-dropdown-item';
        
        // Construct display text based on what fields are available
        let displayText = suggestion.values['adrex-whole-address'];
        if (!displayText) {
             // Fallback to constructing from parts if whole address is missing
             const street = suggestion.values['adrex-street'] || '';
             const num = suggestion.values['adrex-number'] || '';
             const city = suggestion.values['adrex-city'] || '';
             const zip = suggestion.values['adrex-zip'] || '';
             displayText = `${street} ${num}, ${zip} ${city}`.trim();
        }

        // Highlight matching query
        item.innerHTML = this.highlightText(displayText, query);
        
        item.addEventListener('click', () => {
          this.fillInstance(suggestion);
          this.closeDropdown();
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

  highlightText(text: string, query: string): string {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
  }

  handleKeydown(e: KeyboardEvent) {
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
        this.fillInstance(this.suggestions[this.selectedIndex]);
        this.closeDropdown();
      }
    } else if (e.key === 'Escape') {
      this.closeDropdown();
    }
  }

  updateActiveItem() {
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

  closeDropdown() {
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
      this.selectedIndex = -1;
      this.activeInput = null;
    }
  }

  fillInstance(suggestion: AddressSuggestion) {
    const values = suggestion.values;
    // The API returns values keyed by the CSS class name directly (e.g. "adrex-city")
    
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

// --- Initialization Logic ---

function detectApiUrl() {
  const script = document.currentScript as HTMLScriptElement;
  if (script) {
    const dataUrl = script.getAttribute('data-adrex-url');
    if (dataUrl) {
      config.apiUrl = dataUrl.replace(/\/$/, '');
      return;
    }
    // Fallback to origin of the script, but usually we want the explicit URL or default
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
    
    // Find instance class
    el.classList.forEach(cls => {
      if (cls.startsWith('adrex-instance-')) {
        instanceId = cls.substring('adrex-instance-'.length);
      }
    });

    let instance: AdrexInstance;
    if (instanceId === 'default') {
      if (!defaultInstance) defaultInstance = new AdrexInstance('default');
      instance = defaultInstance;
    } else {
      if (!instances[instanceId]) instances[instanceId] = new AdrexInstance(instanceId);
      instance = instances[instanceId];
    }

    instance.addInput(el);
  });
}

// --- Public API ---

const adrex = {
  setClientId: (id: string) => {
    config.clientId = id;
  },
  
  beforeInit: null as (() => void) | null,
  afterInit: null as (() => void) | null,
  
  getInstance: (instanceId?: string) => {
    if (!instanceId || instanceId === 'default') return defaultInstance;
    return instances[instanceId];
  },

  rebindAllForms: (callback?: () => void) => {
    scanDOM();
    if (callback) callback();
  },

  // Internal access for testing/debugging if needed
  get apiUrl() { return config.apiUrl; },
  set apiUrl(url: string) { config.apiUrl = url; },
  
  get clientId() { return config.clientId; }
};

// --- Boot ---

detectApiUrl();
injectStyles();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

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
