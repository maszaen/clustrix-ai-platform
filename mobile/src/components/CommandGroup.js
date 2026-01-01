
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Layers, ChevronDown, ChevronRight, Terminal } from 'lucide-react-native';
import CommandBlock from './CommandBlock';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

// Only enable LayoutAnimation on old architecture (fabric check)
if (Platform.OS === 'android' && !global?.nativeFabricUIManager) {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const CommandGroup = ({ group }) => {
    const commands = group.commands || [];
    const count = commands.length;
    
    // Container expansion state (for multi-command groups)
    const [isGroupExpanded, setIsGroupExpanded] = useState(false);
    
    // Accordion state: track which inner command is expanded (Mutex logic)
    // null = none expanded
    const [activeCmdIndex, setActiveCmdIndex] = useState(null);

    const toggleGroup = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsGroupExpanded(!isGroupExpanded);
    };
    
    const toggleItem = (index) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        // Mutex logic: If clicking active, close it. If clicking other, open it (and close others implicitly).
        setActiveCmdIndex(prev => prev === index ? null : index);
    };

    // Auto-expand logic: If a command fails, expand the group and that specific command
    useEffect(() => {
        const errorIndex = commands.findIndex(c => c.status === 'complete' && c.output?.success === false);
        if (errorIndex !== -1) {
             // Only auto-expand if not already interacting? 
             // Logic: If error appears, user should see it.
             if (!isGroupExpanded) setIsGroupExpanded(true);
             if (activeCmdIndex !== errorIndex) setActiveCmdIndex(errorIndex);
        }
    }, [commands, isGroupExpanded]); // Dep check to prevent loops? status changes trigger this.

    // Direct render if single command (Electron parity behavior)
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
                {isGroupExpanded ? <ChevronDown size={16} color={COLORS.fgMuted} /> : <ChevronRight size={16} color={COLORS.fgMuted} />}
            </TouchableOpacity>
            
            <View style={styles.list}>
                {/* Previous commands hidden when collapsed */}
                {isGroupExpanded && commands.slice(0, count - 1).map((cmd, i) => (
                    <CommandBlock 
                        key={i} 
                        command={cmd} 
                        expanded={activeCmdIndex === i}
                        onToggle={() => toggleItem(i)}
                    />
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

