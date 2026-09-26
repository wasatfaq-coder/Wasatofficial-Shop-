import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { sanitizeForFirestore } from './firebaseSync';

export interface QuickPhrasesData {
  global: string[];
  byCategory: Record<string, string[]>;
  materials: string[];
}

const DEFAULT_QUICK_PHRASES: QuickPhrasesData = {
  global: [
    'Итальянская ткань премиального качества.',
    'Удобная посадка и анатомический крой.',
    'Плотная износостойкая ткань.',
    'Мягкая дышащая фактура для максимального комфорта.',
    'Идеально подходит для повседневного и делового гардероба.',
    'Устойчив к многочисленным стиркам и не теряет форму.',
    'Премиальная фурнитура и аккуратные ровные швы.',
    'Элегантный силуэт, подчеркивающий достоинства фигуры.',
  ],
  byCategory: {
    linen: [
      '100% умягченный органический лен с эффектом Stonewash.',
      'Естественная терморегуляция и воздухопроницаемость в жаркую погоду.',
      'Фактурная благородная текстура полотна с легким естественным блеском.',
      'Идеальный выбор для летнего гардероба, пляжного отдыха и прогулок.',
      'Не вызывает раздражения и приятен к телу в знойный день.',
    ],
    shirts: [
      'Усиленный воротник держит безупречную форму в течение всего дня.',
      'Перламутровые пуговицы с надежным перекрестным пришивом.',
      'Французская планка и регулируемые манжеты на пуговицах.',
      'Дышащий хлопковый поплин высокой плотности.',
      'Отлично сочетается как с классическим костюмом, так и с джинсами.',
      'Ткань Easy Care практически не мнется и легко гладится.',
    ],
    tshirts: [
      'Плотный гребенной хлопок пенье 220 г/м².',
      'Усиленная горловина с эластичной бейкой не растягивается со временем.',
      'Свободный крой Relaxed Fit с идеальной посадкой по плечам.',
      'Шелковистая текстура полотна с двойной энзимной обработкой.',
      'Базовый лаконичный силуэт для стильных многослойных образов.',
    ],
    jackets: [
      'Мембранная ткань с водо- и ветрозащитной пропиткой DWR.',
      'Надежная японская молния YKK с мягким и плавным ходом.',
      'Легкий гипоаллергенный утеплитель нового поколения.',
      'Глубокие утепленные карманы на мягкой флисовой подкладке.',
      'Ветрозащитная планка и анатомический регулируемый капюшон.',
      'Удобный внутренний карман на молнии для документов и телефона.',
    ],
    trousers: [
      'Анатомический пояс со скрытой эластичной вставкой для свободы движений.',
      'Глубокие прорезные карманы с усиленной строчкой по краям.',
      'Стрелки с перманентной фиксацией не требуют сложной глажки.',
      'Плотный хлопковый твил с добавлением эластана для максимального комфорта.',
      'Зауженный книзу силуэт Slim Tapered, гармонирующий с любой обувью.',
    ],
    sweatshirts: [
      'Плотный премиальный футер 3-нитка с диагональной изнанкой 380 г/м².',
      'Эластичные манжеты и пояс из кашкорсе повышенной плотности.',
      'Глубокий двойной капюшон отлично держит форму и объем.',
      'Свободная оверсайз посадка, не сковывающая движений.',
      'Устойчивое крашение полотна, цвет сохраняет насыщенность после стирок.',
    ],
    suits: [
      'Шерсть Super 130s от ведущих итальянских текстильных мануфактур.',
      'Полубортовая конструкция (Half-Canvas) для естественной посадки по фигуре.',
      'Рабочие шлицы на рукавах с пуговицами из натурального рога.',
      'Шелковистая дышащая подкладка для идеального скольжения.',
      'Безупречный силуэт для деловых встреч, презентаций и торжеств.',
    ],
    accessories: [
      'Натуральная цельнозерновая кожа премиальной выделки.',
      'Надежная металлическая фурнитура с антикоррозийным покрытием.',
      'Подарочная брендовая упаковка в комплекте.',
    ],
  },
  materials: [
    '100% лен',
    '100% премиум хлопок пенье',
    '100% шерсть Super 120s',
    '70% шерсть, 30% натуральный шелк',
    '80% хлопок, 20% полиэстер',
    '80% полиэстер, 20% хлопок',
    '100% натуральная кожа наппа',
    '100% монгольский кашемир',
    '95% хлопок, 5% эластан',
    'Влагоотталкивающая мембрана 10000/10000',
    '60% шерсть, 40% вискоза',
    '90% пух, 10% перо (Fill Power 700+)',
  ],
};

const STORAGE_KEY = 'manstyle_quick_phrases_v1';

// In-memory cache
let cachedPhrases: QuickPhrasesData = loadFromLocalStorage();
const listeners = new Set<(data: QuickPhrasesData) => void>();
let isSeedingPhrases = false;

function loadFromLocalStorage(): QuickPhrasesData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.global)) {
        return {
          global: parsed.global || DEFAULT_QUICK_PHRASES.global,
          byCategory: { ...DEFAULT_QUICK_PHRASES.byCategory, ...(parsed.byCategory || {}) },
          materials: parsed.materials || DEFAULT_QUICK_PHRASES.materials,
        };
      }
    }
  } catch (e) {
    console.warn('Could not read quick phrases from localStorage:', e);
  }
  return DEFAULT_QUICK_PHRASES;
}

function saveToLocalStorage(data: QuickPhrasesData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Could not save quick phrases to localStorage:', e);
  }
}

function notifyListeners(data: QuickPhrasesData) {
  cachedPhrases = data;
  saveToLocalStorage(data);
  listeners.forEach((listener) => {
    try {
      listener(data);
    } catch (e) {
      console.error('Error in quick phrases listener:', e);
    }
  });
}

/**
 * Subscribes to real-time updates of Quick Phrases across Firestore & Local Storage.
 */
export function subscribeToQuickPhrases(
  onUpdate: (data: QuickPhrasesData) => void,
  onError?: (error: unknown) => void
): () => void {
  listeners.add(onUpdate);
  // Immediate trigger with current cache
  onUpdate(cachedPhrases);

  const docRef = doc(db, 'settings', 'quick_phrases');

  const unsubscribe = onSnapshot(
    docRef,
    async (snapshot) => {
      if (!snapshot.exists()) {
        if (!isSeedingPhrases) {
          isSeedingPhrases = true;
          try {
            await setDoc(docRef, sanitizeForFirestore(DEFAULT_QUICK_PHRASES));
          } catch (seedErr) {
            console.warn('Could not seed initial quick phrases to Firestore:', seedErr);
          } finally {
            isSeedingPhrases = false;
          }
        }
        notifyListeners(DEFAULT_QUICK_PHRASES);
        return;
      }

      const remote = snapshot.data() as Partial<QuickPhrasesData>;
      // A list the admin emptied stays empty: the built-in phrases fill only missing fields
      const merged: QuickPhrasesData = {
        global: Array.isArray(remote.global) ? remote.global : DEFAULT_QUICK_PHRASES.global,
        byCategory: {
          ...DEFAULT_QUICK_PHRASES.byCategory,
          ...(remote.byCategory || {}),
        },
        materials: Array.isArray(remote.materials) ? remote.materials : DEFAULT_QUICK_PHRASES.materials,
      };

      notifyListeners(merged);
    },
    (error) => {
      console.warn('Firestore Quick Phrases subscription warning:', error);
      if (onError) onError(error);
    }
  );

  return () => {
    listeners.delete(onUpdate);
    unsubscribe();
  };
}

/**
 * Saves all quick phrases to Firestore & local storage.
 */
async function saveQuickPhrasesToFirestore(data: QuickPhrasesData): Promise<void> {
  notifyListeners(data);
  try {
    const docRef = doc(db, 'settings', 'quick_phrases');
    await setDoc(docRef, sanitizeForFirestore(data));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/quick_phrases');
  }
}

/**
 * Adds a new quick phrase or accent to a category, global pool, or material presets.
 */
export async function addQuickPhrase(
  target: 'global' | 'material' | string,
  phrase: string
): Promise<QuickPhrasesData> {
  const trimmed = phrase.trim();
  if (!trimmed) return cachedPhrases;

  const current = { ...cachedPhrases };

  if (target === 'material') {
    if (!current.materials.includes(trimmed)) {
      current.materials = [trimmed, ...current.materials];
    }
  } else if (target === 'global' || target === 'all') {
    if (!current.global.includes(trimmed)) {
      current.global = [trimmed, ...current.global];
    }
  } else {
    // Specific category
    const catList = current.byCategory[target] || [];
    if (!catList.includes(trimmed)) {
      current.byCategory = {
        ...current.byCategory,
        [target]: [trimmed, ...catList],
      };
    }
  }

  await saveQuickPhrasesToFirestore(current);
  return current;
}

/**
 * Deletes a quick phrase or accent from a category, global pool, or material presets.
 */
export async function deleteQuickPhrase(
  target: 'global' | 'material' | string,
  phrase: string
): Promise<QuickPhrasesData> {
  const trimmed = phrase.trim();
  const current = { ...cachedPhrases };

  if (target === 'material') {
    current.materials = current.materials.filter((m) => m !== trimmed);
  } else if (target === 'global' || target === 'all') {
    current.global = current.global.filter((g) => g !== trimmed);
  } else {
    const catList = current.byCategory[target] || [];
    current.byCategory = {
      ...current.byCategory,
      [target]: catList.filter((c) => c !== trimmed),
    };
  }

  await saveQuickPhrasesToFirestore(current);
  return current;
}

