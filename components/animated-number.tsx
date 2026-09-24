import { useState } from "react";

function Character({ value }: { value: string }) {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState<string | null>(null);
  if (value !== current) {
    setPrevious(current);
    setCurrent(value);
  }
  const animate =
    /^\p{Decimal_Number}$/u.test(value) &&
    /^\p{Decimal_Number}$/u.test(previous ?? "");
  return (
    <span className="number-character">
      <span
        key={current}
        className={`number-current${animate ? " number-arriving" : ""}`}
        onAnimationEnd={() => setPrevious(null)}
      >
        {current}
      </span>
      {animate && (
        <span
          className="number-previous number-leaving"
          aria-hidden="true"
          data-character={previous}
        />
      )}
    </span>
  );
}

export default function AnimatedNumber({ value }: { value: string }) {
  const characters = [...value];
  return characters.map((character, index) => (
    <Character key={characters.length - index} value={character} />
  ));
}
