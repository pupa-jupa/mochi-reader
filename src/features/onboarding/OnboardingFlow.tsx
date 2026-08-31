import { ArrowLeft, ArrowRight, Check, FolderPlus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../components/Button';
import { Mascot } from '../../components/Mascot';
import { libraryStore } from '../../stores/libraryStore';
import { type ThemeName, useSettingsStore } from '../../stores/settingsStore';

export function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const complete = useSettingsStore((state) => state.completeOnboarding);

  return (
    <div aria-label="Первый запуск Mochi Reader" className="onboarding" role="dialog" aria-modal="true">
      <div className="onboarding__panel">
        <div className="onboarding__steps" aria-label={`Шаг ${step + 1} из 3`}>
          {[0, 1, 2].map((index) => <span className={index <= step ? 'is-active' : ''} key={index} />)}
        </div>

        {step === 0 ? (
          <div className="onboarding__content onboarding__content--welcome">
            <Mascot className="onboarding__mascot" pose="welcome" />
            <div><p className="eyebrow">Добро пожаловать</p><h1>Твоя тихая полка</h1><p>Mochi Reader хранит книги, прогресс и заметки локально. Никакого аккаунта и обязательного облака.</p></div>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="onboarding__content">
            <p className="eyebrow">Выбери настроение</p><h1>Какой сегодня вечер?</h1>
            <div className="onboarding-themes">
              {(['sakura', 'milk', 'night'] as ThemeName[]).map((option) => (
                <button aria-pressed={theme === option} data-theme-preview={option} key={option} onClick={() => setTheme(option)} type="button">
                  <span /><strong>{option === 'sakura' ? 'Sakura Pink' : option === 'milk' ? 'Strawberry Milk' : 'Night Sakura'}</strong>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="onboarding__content">
            <p className="eyebrow">Последний штрих</p><h1>Добавить библиотеку?</h1><p>Можно выбрать папку сейчас или сделать это позже. Исходные файлы не перемещаются.</p>
            <Button onClick={() => void libraryStore.getState().importFolder()} variant="secondary"><FolderPlus aria-hidden="true" /> Выбрать папку</Button>
            <div className="privacy-note"><ShieldCheck aria-hidden="true" /><span>Reader читает только выбранные тобой файлы.</span></div>
          </div>
        ) : null}

        <footer className="onboarding__footer">
          <Button disabled={step === 0} onClick={() => setStep((current) => current - 1)} variant="ghost"><ArrowLeft aria-hidden="true" /> Назад</Button>
          {step < 2 ? (
            <Button onClick={() => setStep((current) => current + 1)}>Дальше <ArrowRight aria-hidden="true" /></Button>
          ) : (
            <Button onClick={complete}><Check aria-hidden="true" /> Начать читать</Button>
          )}
        </footer>
      </div>
    </div>
  );
}
