import { fromJS, Map } from 'immutable';
import { defaultOptions, DefaultFormatOptions, FormatOptions, formatDate, formatNumber, GivenDate } from './format';
import defaultFormats from './defaultFormats';
import { AppStore, InterpolationDictionary, TranslatorOptions, Messages, MsgOptions, TranslationResult } from './types';

const INTERPOLATION_REGEXP = /%{([\w0-9]+)}/g;

export interface Msg {
  (key: string | string[], options?: MsgOptions | InterpolationDictionary | MsgOptions & InterpolationDictionary): TranslationResult;
}

export interface FormatDate {
  (givenDate: GivenDate, customFormat?: string): string;
}

export interface FormatNumber {
  (givenNumber: number, options?: FormatOptions): string;
}

function isAppStore(x: any): x is AppStore {
  return (x && typeof x.getState === 'function');
}

export type StateOptions = Map<string, string | number>;
export type LookupResult = TranslationResult | Messages;

export class Translator {
  messages = Map() as Messages;
  locale = 'en';
  fallbackLocale = '';
  store: AppStore | null = null;

  constructor(options: TranslatorOptions | AppStore) {
    if (isAppStore(options)) {
      this.store = options;
    } else {
      this.messages = options.messages || fromJS({ en: {}});
      this.locale = options.locale;
      this.fallbackLocale = options.fallbackLocale || this.fallbackLocale;
    }
  }

  __getPath(key: string | string[], options: MsgOptions) {
    const splittedKey = ([] as string[]).concat(key).join('.').split('.');
    return options.scope ? options.scope.split('.').concat(splittedKey) : splittedKey;
  }

  __getResultForKeys(key: string[], locale: string, options: MsgOptions) {
      return key.reduce(
        (acc: LookupResult, subKey: string | string[]) =>  acc || this.__findTranslationForLocale(locale, this.__getPath(subKey, options)),
        null
      );
  }
  // tslint:disable-next-line:typedef
  msg: Msg = (key, givenOptions) => {
    const options = givenOptions || {};
    const defaultTextFromKey = Array.isArray(key) ? key[0] : key;

    if (Array.isArray(key)) {
      const foundMatch = this.__getResultForKeys(key, this.__locale(), options) ||
        this.__getResultForKeys(key, this.__fallbackLocale(), options);
      if (foundMatch && typeof foundMatch !== 'object') {
        return foundMatch;
      }
    }

    const result = this.__findTranslation(this.__getPath(key, options));
    const defaultText = (options as MsgOptions).disableDefault ? null : defaultTextFromKey;

    if (Map.isMap(result)) {
      return (result as Messages).toJS();
    } else {
      const returnText = result || defaultText;

      if (typeof returnText === 'string' && this.__hasInterpolation(returnText)) {
        return this.__interpolate(returnText, (options as InterpolationDictionary));
      } else {
        return returnText;
      }
    }
  }

  formatDate: FormatDate = (givenDate, customFormat) => {
    const keywordFormat = customFormat && this.__findTranslation(['formats', 'date', customFormat, 'format']);
    const defaultFormat = this.__findTranslation(['formats'].concat(['date', 'default', 'format']));
    const format = (keywordFormat || customFormat || defaultFormat || defaultFormats.formats.date.default.format) as string;

    return formatDate(givenDate, this.locale, format);
  }

  formatNumber: FormatNumber = (givenNumber, options) => {
    if (typeof options === 'string') {
      return formatNumber(givenNumber, this.__getOptions('number', options, {}));
    } else {
      return formatNumber(givenNumber, this.__getOptions('number', undefined, options));
    }
  }

  formatCurrency: FormatNumber = (givenNumber, options) => {
    const defaultFormat = this.__getOptions('number', 'currency', options);

    return formatNumber(givenNumber, defaultFormat);
  }

  formatPercentage: FormatNumber = (givenNumber, options) => {
    const defaultFormat = this.__getOptions('number', 'percentage', options);

    return formatNumber(givenNumber, defaultFormat);
  }

  // tslint:disable-next-line:typedef
  __getOptions(type: string, key?: string, overrideOptions: FormatOptions = {}): DefaultFormatOptions {
    const defaultTypeOptions = this.__findTranslation(['formats'].concat(type, 'default')) as StateOptions;

    const keyOptions = key && (this.__findTranslation(['formats'].concat(type, key)) as StateOptions);

    const result =  {
      ...defaultOptions,
      ...defaultFormats.formats[type].default,
      ...(key && defaultFormats.formats[type][key]),
      ...(defaultTypeOptions && defaultTypeOptions.toJS()),
      ...(keyOptions && keyOptions.toJS()),
      ...overrideOptions
    };

    return result;
  }

  __findTranslation(keys: string[]): LookupResult {
    return this.__findTranslationForLocale(this.__locale(), keys) ||
      this.__findTranslationForLocale(this.__fallbackLocale(), keys);
  }

  __findTranslationForLocale(locale: string, keys: string[]): LookupResult {
    return this.__messages().getIn([locale].concat(keys));
  }

  __locale() {
    if (this.store) {
      return this.store.getState().translate.locale;
    } else {
      return this.locale;
    }
  }

  __fallbackLocale() {
    if (this.store) {
      return this.store.getState().translate.fallbackLocale || this.locale;
    } else {
      return this.fallbackLocale || this.locale;
    }
  }

  __messages(): Messages {
    if (this.store) {
      return this.store.getState().translate.messages as Messages;
    }

    return this.messages || fromJS({});
  }

  __hasInterpolation(msg: string): boolean {
    return INTERPOLATION_REGEXP.test(msg);
  }

  __interpolate(msg: string, dictionary: InterpolationDictionary): string {
    return msg.replace(INTERPOLATION_REGEXP, (val: string, match: string): string => {
      return dictionary[match].toString();
    });
  }
}
