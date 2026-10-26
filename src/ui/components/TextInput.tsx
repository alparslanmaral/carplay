import type { InputHTMLAttributes, Ref } from 'react';
import { useDriving } from '../../core/driving';
import { useSettings } from '../../core/settings';

/**
 * Text field that respects the driving lock. While the car is moving a tap opens the "Parked? Passenger mode"
 * prompt instead of the keyboard (the global focus guard in useAppEffects is the backstop for programmatic focus).
 */
export function TextInput({
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const lockInput = useSettings((s) => s.lockInput);
  const passengerAllowed = useSettings((s) => s.passengerOverride);
  const moving = useDriving((s) => s.moving);
  const passenger = useDriving((s) => s.passenger);
  const locked = lockInput && moving && !(passengerAllowed && passenger);
  return (
    <input
      {...props}
      ref={ref}
      className={`input${props.className ? ` ${props.className}` : ''}`}
      readOnly={locked || props.readOnly}
      inputMode={locked ? 'none' : props.inputMode}
      data-locked={locked}
      onPointerDown={(e) => {
        props.onPointerDown?.(e);
        if (locked) {
          e.preventDefault();
          useDriving.getState().openPrompt();
        }
      }}
    />
  );
}
