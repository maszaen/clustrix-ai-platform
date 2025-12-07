import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';

const COLORS = {
  bg: '#000000ff',
  bgSecondary: '#282A2C',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  accent: '#0e4bae',
  primary: '#D3E3FD',
  borderLight: '#3c4141',
  hover: '#333537',
};

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SessionItem({ session, isActive, onSelect, onDelete }) {
  const handleDelete = () => {
    Alert.alert(
      'Delete Chat',
      `Delete "${session.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(session.id) },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[styles.sessionItem, isActive && styles.sessionItemActive]}
      onPress={() => onSelect(session)}
      onLongPress={handleDelete}
      activeOpacity={0.7}
    >
      <View style={styles.sessionIcon}>
        <Ionicons 
          name={isActive ? "chatbubble" : "chatbubble-outline"} 
          size={18} 
          color={isActive ? COLORS.primary : COLORS.fgMuted} 
        />
      </View>
      <View style={styles.sessionInfo}>
        <Text 
          style={[styles.sessionTitle, isActive && styles.sessionTitleActive]} 
          numberOfLines={1}
        >
          {session.name || 'New Chat'}
        </Text>
        <Text style={styles.sessionTime}>{formatTime(session.updated_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function SessionList({ sessions, currentSession, onSelect, onDelete, onNew }) {
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

  const filteredSessions = searchQuery 
    ? sessions.filter(s => s.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

  return (
    <View style={[styles.container, { marginTop: 13 }]}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={COLORS.fgMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          placeholderTextColor={COLORS.fgMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={COLORS.fgMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {/* New Chat Button */}
      <TouchableOpacity style={styles.newChatBtn} onPress={onNew} activeOpacity={0.8}>
        <Ionicons name="add" size={20} color={COLORS.fg} />
        <Text style={styles.newChatText}>New Chat</Text>
      </TouchableOpacity>

      
      

      {/* Divider */}
      <View style={styles.divider} />

      {/* Sessions */}
      <FlatList
        data={filteredSessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionItem
            session={item}
            isActive={currentSession?.id === item.id}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        )}
        contentContainerStyle={styles.sessionList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={32} color={COLORS.fgMuted} />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No chats found' : 'No conversations yet'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const SIDEBAR_PADDING = 12;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SIDEBAR_PADDING,
    paddingVertical: 12,
    paddingTop: 8,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SIDEBAR_PADDING,
    paddingVertical: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 20,
    gap: 8,
  },
  newChatText: {
    color: COLORS.fg,
    fontSize: 14,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SIDEBAR_PADDING,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 14,
    padding: 0,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: SIDEBAR_PADDING,
    marginTop: 12,
    marginBottom: 6,
  },
  sessionList: {
    paddingHorizontal: 6,
    paddingBottom: 20,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  sessionItemActive: {
    backgroundColor: COLORS.hover,
  },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  sessionTitleActive: {
    color: COLORS.fg,
  },
  sessionTime: {
    color: COLORS.fgMuted,
    fontSize: 12,
    opacity: 0.7,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 12,
  },
  emptyText: {
    color: COLORS.fgMuted,
    fontSize: 14,
  },
});
