import { memo, useCallback } from 'react';
import { LongPressGestureHandler, State } from 'react-native-gesture-handler';

/**
 * LongPressGuard
 * Prevents accidental long-press triggers during scroll by canceling on movement.
 */
const LongPressGuard = memo(function LongPressGuard({
  children,
  onLongPress,
  disabled = false,
  minDurationMs = 350,
  maxDist = 15,
}) {
  const handleStateChange = useCallback(({ nativeEvent }) => {
    if (disabled) return;
    if (nativeEvent.state === State.ACTIVE) {
      onLongPress?.({
        nativeEvent: {
          pageX: nativeEvent.absoluteX,
          pageY: nativeEvent.absoluteY,
        },
      });
    }
  }, [disabled, onLongPress]);

  return (
    <LongPressGestureHandler
      onHandlerStateChange={handleStateChange}
      minDurationMs={minDurationMs}
      maxDist={maxDist}
      enabled={!disabled}
    >
      {children}
    </LongPressGestureHandler>
  );
});

export default LongPressGuard;
