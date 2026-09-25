import { TRAIN_OPTIONS, type TrainType } from "../src/train-types.ts";
import Popover from "./popover.tsx";
import TrainArt from "./train-art.tsx";

export default function TrainPicker({ value, onChange }: { value: TrainType; onChange(type: TrainType): void }) {
  const selected = TRAIN_OPTIONS.find(option => option.id === value)!;
  return <Popover role="listbox">
    {({ triggerProps, panelProps, close }) => <div className="train-control">
      <button {...triggerProps} id="train-trigger" type="button" className="train-trigger"
        aria-label={`Choose train: ${selected.name}`} aria-controls="train-options" title={`Choose train · ${selected.name}`}>
        <span className="train-current-preview"><TrainArt type={value} /></span>
        <svg className="train-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      <div {...panelProps} className="train-menu">
        <p className="train-menu-heading">YOUR CARRIAGE</p>
        <div id="train-options" role="listbox" aria-label="Choose train" className="train-options">
          {TRAIN_OPTIONS.map(option => <button key={option.id} type="button" role="option"
            id={`train-option-${option.id}`} className="train-option" aria-selected={value === option.id}
            aria-label={option.name} tabIndex={-1} onClick={() => { onChange(option.id); close(true); }}>
            <span className="train-preview"><TrainArt type={option.id} /></span>
            <span className="train-option-copy">
              <span className="train-option-name">{option.name}</span>
              <span className="train-option-description">{option.description}</span>
            </span>
            <svg className="train-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 8 3 3 5-6" /></svg>
          </button>)}
        </div>
      </div>
    </div>}
  </Popover>;
}
