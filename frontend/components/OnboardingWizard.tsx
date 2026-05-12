import { useState } from "react";
import { DIETARY_OPTIONS } from "../lib/dietary";
import Portal from "./Portal";

interface Props {
  initialDisplayName: string;
  onComplete: (profile: { display_name: string; home_city: string; dietary_notes: string }) => void;
  onSkip: () => void;
}

const STEPS = ["Name", "Home City", "Preferences"] as const;

export default function OnboardingWizard({ initialDisplayName, onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [homeCity, setHomeCity] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);

  const toggleDietary = (id: string) =>
    setDietary(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else finish();
  };

  const finish = () =>
    onComplete({
      display_name: displayName.trim() || initialDisplayName,
      home_city: homeCity.trim(),
      dietary_notes: JSON.stringify(dietary),
    });

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-purple-500 px-8 pt-8 pb-6 text-white">
            <p className="text-sm font-medium uppercase tracking-widest opacity-80 mb-1">Welcome to Local Taste</p>
            <h2 className="text-2xl font-bold">Activate your passport 🛂</h2>
            <p className="text-sm opacity-80 mt-1">Takes 30 seconds, helps us personalise your experience.</p>
            {/* Step dots */}
            <div className="flex gap-2 mt-5">
              {STEPS.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? "bg-white w-8" : "bg-white/30 w-4"}`} />
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-6">
            {step === 0 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">What should we call you?</label>
                <input
                  autoFocus
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && next()}
                  placeholder="e.g. Alex"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base"
                />
              </div>
            )}

            {step === 1 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Where are you based?</label>
                <p className="text-xs text-gray-400 mb-3">We&apos;ll use this to distinguish home from travel.</p>
                <input
                  autoFocus
                  type="text"
                  value={homeCity}
                  onChange={e => setHomeCity(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && next()}
                  placeholder="e.g. Barcelona, Spain"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-base"
                />
              </div>
            )}

            {step === 2 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Any dietary preferences?</label>
                <p className="text-xs text-gray-400 mb-3">We surface better restaurant options when you search.</p>
                <div className="grid grid-cols-2 gap-2">
                  {DIETARY_OPTIONS.map(opt => {
                    const active = dietary.includes(opt.id);
                    return (
                      <button key={opt.id} type="button" onClick={() => toggleDietary(opt.id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                          active ? "border-primary bg-purple-50 text-primary" : "border-gray-200 text-gray-600 hover:border-purple-200"
                        }`}>
                        <span>{opt.emoji}</span>
                        <span>{opt.label}</span>
                        {active && <span className="ml-auto text-primary text-xs">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 pb-8 flex items-center justify-between">
            <button onClick={onSkip} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              Skip for now
            </button>
            <button
              onClick={next}
              className="px-6 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors text-sm"
            >
              {step === STEPS.length - 1 ? "Done ✓" : "Continue →"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
