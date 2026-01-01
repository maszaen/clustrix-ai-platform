import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, UIManager } from 'react-native';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withTiming, 
    FadeIn 
} from 'react-native-reanimated';
import { ChevronRight, Terminal } from 'lucide-react-native';
import CommandBlock from './CommandBlock';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

// Enable LayoutAnimation for other parts of app if needed, 
// strictly conditional here to avoid crashes
if (Platform.OS === 'android' && !global?.nativeFabricUIManager) {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const CommandGroup = ({ group }) => {
    const commands = group.commands || [];
    const count = commands.length;
    
    const [isGroupExpanded, setIsGroupExpanded] = useState(false);
    const [activeCmdIndex, setActiveCmdIndex] = useState(null);

    // Minimal Chevron Rotation
    const rotation = useSharedValue(0);
    useEffect(() => {
        rotation.value = withTiming(isGroupExpanded ? 90 : 0, { duration: 200 });
    }, [isGroupExpanded]);
    const chevronStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }]
    }));

    const toggleGroup = () => {
        setIsGroupExpanded(!isGroupExpanded);
    };
    
    const toggleItem = (index) => {
        setActiveCmdIndex(prev => prev === index ? null : index);
    };

    // Auto-expand logic
    useEffect(() => {
        const errorIndex = commands.findIndex(c => c.status === 'complete' && c.output?.success === false);
        if (errorIndex !== -1) {
             if (!isGroupExpanded) setIsGroupExpanded(true);
             if (activeCmdIndex !== errorIndex) setActiveCmdIndex(errorIndex);
        }
    }, [commands, isGroupExpanded]);

    if (count === 1) {
        return (
            <CommandBlock 
                command={commands[0]} 
                expanded={activeCmdIndex === 0}
                onToggle={() => toggleItem(0)}
            />
        );
    }

    if (count === 0) return null;

    return (
        <View style={styles.container}>
            <TouchableOpacity 
                style={styles.header}
                onPress={toggleGroup}
                activeOpacity={0.7}
            >
                <View style={styles.left}>
                    <View style={styles.iconContainer}>
                        <Terminal size={14} color={COLORS.fgMuted} />
                    </View>
                    <Text style={styles.title}>{count} Steps Executed</Text>
                </View>
                <Animated.View style={chevronStyle}>
                    <ChevronRight size={16} color={COLORS.fgMuted} />
                </Animated.View>
            </TouchableOpacity>
            
            <View style={styles.list}>
                {/* Simple Conditional Rendering with FadeIn */}
                {isGroupExpanded && commands.slice(0, count - 1).map((cmd, i) => (
                    <Animated.View 
                        key={i} 
                        entering={FadeIn.duration(200)}
                    > 
                         <CommandBlock 
                            command={cmd} 
                            expanded={activeCmdIndex === i}
                            onToggle={() => toggleItem(i)}
                        />
                    </Animated.View>
                ))}

                {/* Last command is ALWAYS visible */}
                <CommandBlock 
                    command={commands[count - 1]} 
                    expanded={activeCmdIndex === (count - 1)}
                    onToggle={() => toggleItem(count - 1)}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 4,
        borderRadius: 18,
        backgroundColor: COLORS.bgSecondary,
        borderWidth: 0,
        borderColor: COLORS.borderLight,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        paddingTop: 12,
        paddingLeft: 13,
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        marginRight: 6,
    },
    title: {
        fontSize: 12,
        color: COLORS.fgMuted,
        fontFamily: FONTS.displayItalic,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    list: {
        paddingHorizontal: 0,
        paddingBottom: 0,
    }
});

export default CommandGroup;
