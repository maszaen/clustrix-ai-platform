
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Loader2 } from 'lucide-react-native';
import { transformCommandText } from '../utils/agenticParser';
import { GeneratedImageView } from './ToolResultView';
import { COLORS } from '../constants/colors';

// Only enable LayoutAnimation on old architecture (fabric check)
if (Platform.OS === 'android' && !global?.nativeFabricUIManager) {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const CommandBlock = ({ command }) => {
    // command structure from agenticParser: 
    // { input: {command, args, commentary}, output: {success, output}, status: 'running'|'complete' }
    
    const [expanded, setExpanded] = useState(false);
    
    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
    };

    const { input, output, status } = command;
    const isRunning = status === 'running';
    const isSuccess = output?.success !== false; // Default true unless explicitly false

    // Auto-expand on error to show details
    useEffect(() => {
        if (!isSuccess && status === 'complete') {
            setExpanded(true);
        }
    }, [isSuccess, status]);

    // Rotation animation for loader
    const rotateAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isRunning) {
            Animated.loop(
                Animated.timing(rotateAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                })
            ).start();
        } else {
            rotateAnim.setValue(0);
        }
    }, [isRunning]);

    const rotate = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

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
                            <Animated.View style={{ transform: [{ rotate }] }}>
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

                {expanded ? <ChevronDown size={16} color={COLORS.fgMuted} /> : <ChevronRight size={16} color={COLORS.fgMuted} />}
            </TouchableOpacity>

            {/* Commentary is vital context, show it nicely */}
            {expanded && input.commentary && (
                <View style={styles.commentary}>
                    <Text style={styles.commentaryLabel}>Reasoning:</Text>
                    <Text style={styles.commentaryText}>{input.commentary}</Text>
                </View>
            )}

            {/* Image Output - for generate_image tool */}
            {(output?.imageBase64 || output?.imageUrl) && (
                <View style={styles.imageOutputContainer}>
                    <GeneratedImageView
                        imageBase64={output.imageBase64}
                        imageUrl={output.imageUrl}
                        prompt={input.args?.prompt}
                        style={input.args?.style}
                    />
                </View>
            )}

            {/* Text Output - only show if no image */}
            {expanded && !(output?.imageBase64 || output?.imageUrl) && (
                <View style={styles.outputContainer}>
                    <View style={styles.outputHeader}>
                        <Text style={styles.outputLabel}>OUTPUT</Text>
                    </View>
                    <Text style={styles.outputText}>
                        {output?.output ? (typeof output.output === 'string' ? output.output : JSON.stringify(output.output, null, 2)) : (isRunning ? 'Waiting for output...' : 'Completed')}
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        backgroundColor: COLORS.bgSecondary,
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
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: COLORS.surface,
        borderTopWidth: 1,
        borderTopColor: COLORS.borderLight,
    },
    commentaryLabel: {
        fontSize: 10,
        color: COLORS.fgMuted,
        marginBottom: 2,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    commentaryText: {
        fontSize: 13,
        color: COLORS.fgMuted,
        lineHeight: 18,
    },
    outputContainer: {
        borderTopWidth: 1,
        borderTopColor: COLORS.borderLight,
        backgroundColor: COLORS.bg,
        padding: 12,
    },
    outputHeader: {
        marginBottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
    },
    outputLabel: {
        fontSize: 10,
        color: COLORS.fgMuted,
        fontWeight: '700',
    },
    outputText: {
        fontFamily: 'monospace',
        fontSize: 12,
        color: COLORS.fg,
        lineHeight: 16,
    },
    imageOutputContainer: {
        borderTopWidth: 1,
        borderTopColor: COLORS.borderLight,
        overflow: 'hidden',
    },
});

export default CommandBlock;

