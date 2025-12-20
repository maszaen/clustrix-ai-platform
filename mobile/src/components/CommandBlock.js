
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Loader2 } from 'lucide-react-native';
import { transformCommandText } from '../utils/agenticParser';

if (Platform.OS === 'android') {
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

    const borderColor = !isSuccess && status === 'complete' ? '#fca5a5' : '#e5e7eb';
    const bgColor = !isSuccess && status === 'complete' ? '#fef2f2' : '#f9fafb';

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
                                <Loader2 size={16} color="#6366f1" />
                            </Animated.View>
                        ) : isSuccess ? (
                            <CheckCircle size={16} color="#10b981" />
                        ) : (
                            <XCircle size={16} color="#ef4444" />
                        )}
                    </View>
                    
                    <Text style={styles.title} numberOfLines={1}>
                        {transformCommandText(input.command, input.args)}
                    </Text>
                </View>

                {expanded ? <ChevronDown size={16} color="#6b7280" /> : <ChevronRight size={16} color="#6b7280" />}
            </TouchableOpacity>

            {/* Commentary is vital context, show it nicely */}
            {expanded && input.commentary && (
                <View style={styles.commentary}>
                    <Text style={styles.commentaryLabel}>Reasoning:</Text>
                    <Text style={styles.commentaryText}>{input.commentary}</Text>
                </View>
            )}

            {/* Output */}
            {expanded && (
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
        backgroundColor: '#fff',
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
        paddingRight: 10,
    },
    iconContainer: {
        marginRight: 8,
        width: 18,
        alignItems: 'center',
    },
    title: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
        fontFamily: 'System', // Use system font for UI elements
    },
    commentary: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
    },
    commentaryLabel: {
        fontSize: 10,
        color: '#9ca3af', // muted
        marginBottom: 2,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    commentaryText: {
        fontSize: 13,
        color: '#4b5563',
        lineHeight: 18,
    },
    outputContainer: {
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        backgroundColor: '#111827', // Dark terminal background
        padding: 12,
    },
    outputHeader: {
        marginBottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
    },
    outputLabel: {
        fontSize: 10,
        color: '#6b7280',
        fontWeight: '700',
    },
    outputText: {
        fontFamily: 'monospace', // Monospace for terminal output
        fontSize: 12,
        color: '#e5e7eb', // bright text on dark bg
        lineHeight: 16,
    }
});

export default CommandBlock;
