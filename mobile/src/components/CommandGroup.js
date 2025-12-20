
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Layers, ChevronDown, ChevronRight } from 'lucide-react-native';
import CommandBlock from './CommandBlock';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const CommandGroup = ({ group }) => {
    const [expanded, setExpanded] = useState(false);
    
    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
    };
    const commands = group.commands || [];
    const count = commands.length;

    // Direct render if single command (Electron parity behavior)
    if (count === 1) {
        return <CommandBlock command={commands[0]} />;
    }

    if (count === 0) return null;

    return (
        <View style={styles.container}>
            <TouchableOpacity 
                style={styles.header}
                onPress={toggleExpand}
                activeOpacity={0.7}
            >
                <View style={styles.left}>
                    <View style={styles.iconContainer}>
                        <Layers size={14} color="#6b7280" />
                    </View>
                    <Text style={styles.title}>{count} Steps Executed</Text>
                </View>
                {expanded ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
            </TouchableOpacity>
            
            {expanded && (
                <View style={styles.list}>
                    {commands.map((cmd, i) => (
                        <CommandBlock key={i} command={cmd} />
                    ))}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 4,
        borderRadius: 8,
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingVertical: 8,
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
        fontWeight: '600',
        color: '#4b5563',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    list: {
        padding: 8,
        paddingTop: 0,
    }
});

export default CommandGroup;
