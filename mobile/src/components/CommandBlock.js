import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, UIManager } from 'react-native';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withTiming, 
    withRepeat, 
    Easing,
    FadeIn
} from 'react-native-reanimated';
import { ChevronRight, CheckCircle, XCircle, Loader2 } from 'lucide-react-native';
import { transformCommandText } from '../utils/agenticParser';
import { GeneratedImageView } from './ToolResultView';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

if (Platform.OS === 'android' && !global?.nativeFabricUIManager) {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const CommandBlock = ({ command, expanded, onToggle }) => {
    const toggleExpand = () => {
        onToggle && onToggle();
    };

    const { input, output, status } = command;
    const isRunning = status === 'running';
    const isSuccess = output?.success !== false;

    // Animations
    const rotateVal = useSharedValue(0);
    const expandVal = useSharedValue(0);

    // Loader Spin
    useEffect(() => {
        if (isRunning) {
            rotateVal.value = withRepeat(
                withTiming(360, { duration: 1000, easing: Easing.linear }), 
                -1
            );
        } else {
            rotateVal.value = 0;
        }
    }, [isRunning]);

    const loaderStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotateVal.value}deg` }]
    }));

    // Chevron Rotation
    useEffect(() => {
        expandVal.value = withTiming(expanded ? 90 : 0, { duration: 200 });
    }, [expanded]);

    const chevronStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${expandVal.value}deg` }]
    }));

    const borderColor = !isSuccess && status === 'complete' ? COLORS.danger + '60' : COLORS.borderLight;
    const bgColor = !isSuccess && status === 'complete' ? COLORS.danger + '15' : COLORS.bgSecondary;

    return (
        <View style={[styles.container, { borderColor }]}>
            <TouchableOpacity 
                style={[styles.header, { backgroundColor: bgColor }]}
                onPress={toggleExpand}
                activeOpacity={0.7}
            >
                <View style={styles.left}>
                    <View style={styles.iconContainer}>
                        {isRunning ? (
                            <Animated.View style={loaderStyle}>
                                <Loader2 size={16} color={COLORS.primary} />
                            </Animated.View>
                        ) : isSuccess ? (
                            <CheckCircle size={16} color={COLORS.success} />
                        ) : (
                            <XCircle size={16} color={COLORS.danger} />
                        )}
                    </View>
                    
                    <Text style={styles.title} numberOfLines={1}>
                        {transformCommandText(input.command, input.args)}
                    </Text>
                </View>

                <Animated.View style={chevronStyle}>
                    <ChevronRight size={16} color={COLORS.fgMuted} />
                </Animated.View>
            </TouchableOpacity>

            {/* Simple content fade in */}
            {expanded && (
                <Animated.View 
                    entering={FadeIn.duration(200)}
                    style={{ paddingBottom: 0, backgroundColor: COLORS.surface }}
                > 
                    {/* Commentary */}
                    {input.commentary && (
                        <View style={styles.commentary}>
                            <Text style={styles.commentaryLabel}>Reasoning</Text>
                            <Text style={styles.commentaryText}>{input.commentary}</Text>
                        </View>
                    )}
        
                    {/* Image Output */}
                    {(output?.imageBase64 || output?.imageUrl) && (
                      <>
                          <View style={styles.separator} />
                        <View style={styles.imageOutputContainer}>
                            <GeneratedImageView
                                imageBase64={output.imageBase64}
                                imageUrl={output.imageUrl}
                                prompt={input.args?.prompt}
                                style={input.args?.style}
                            />
                        </View>
                        </>
                    )}
        
                    {/* Text Output */}
                    {!(output?.imageBase64 || output?.imageUrl) && !['reattach_file', 'list_attachments'].includes(input.command) && (
                          <>
                          <View style={styles.separator} />
                        <View style={styles.outputContainer}>

                            <View style={styles.outputHeader}>
                                <Text style={styles.outputLabel}>OUTPUT</Text>
                            </View>
                            <Text style={styles.outputText}>
                                {output?.output ? (typeof output.output === 'string' ? output.output : JSON.stringify(output.output, null, 2)) : (isRunning ? 'Waiting for output...' : 'Command executed')}
                            </Text>
                        </View>
                        </>
                    )}
                </Animated.View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 0,
    borderRadius: 18,
    borderWidth: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 29,
  },
  iconContainer: {
    marginRight: 8,
    width: 18,
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.fg,
    fontFamily: 'System',
  },
  commentary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    // borderTopWidth: 1,
    // borderTopColor: COLORS.borderLight,
  },
  commentaryLabel: {
    fontSize: 10,
    color: COLORS.fgMuted,
    fontFamily: FONTS.displayItalic,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  commentaryText: {
    fontSize: 13,
    color: COLORS.fgMuted,
    lineHeight: 18,
  },
  outputContainer: {
    // borderTopWidth: 1,
    // borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    padding: 12,
    paddingHorizontal: 16,
  },
  outputHeader: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  outputLabel: {
    fontSize: 10,
    color: COLORS.fgMuted,
    fontFamily: FONTS.displayItalic
  },
  outputText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: COLORS.fgMuted,
    lineHeight: 16,
  },
  imageOutputContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  // Horizontal separator line
  separator: {
    height: 1,
    marginHorizontal: 14,
    backgroundColor: COLORS.borderLight,
  },
});

export default CommandBlock;
