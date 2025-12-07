import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  bg: '#000000ff',
  bgSecondary: '#282A2C',
  inputBg: '#282A2D',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  accent: '#0e4bae',
  primary: '#D3E3FD',
  borderLight: '#3c4141',
  hover: '#1a1a1a',
};

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
      <Text 
        style={[styles.sessionTitle, isActive && styles.sessionTitleActive]} 
        numberOfLines={1}
      >
        {session.name || 'New Chat'}
      </Text>
    </TouchableOpacity>
  );
}

export default function SessionList({ sessions, currentSession, onSelect, onDelete, onNew }) {
  const [searchQuery, setSearchQuery] = useState('');

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
      <TouchableOpacity style={styles.newChatBtn} onPress={onNew} activeOpacity={0.7}>
        <Ionicons name="pencil" size={18} color={COLORS.fg} />
        <Text style={styles.newChatText}>New Chat</Text>
      </TouchableOpacity>

      
      



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
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SIDEBAR_PADDING,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: SIDEBAR_PADDING,
    borderRadius: 10,
    gap: 10,
  },
  newChatText: {
    color: COLORS.fg,
    fontSize: 16,
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SIDEBAR_PADDING,
    height: 45,
    paddingHorizontal: 14,
    backgroundColor: COLORS.inputBg,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 16,
    padding: 0,
  },
  sessionList: {
    paddingBottom: 20,
  },
  sessionItem: {
    paddingVertical: 12,
    paddingHorizontal: SIDEBAR_PADDING,
    marginBottom: 2,
  },
  sessionItemActive: {
    backgroundColor: COLORS.hover,
  },
  sessionTitle: {
    color: COLORS.fgMuted,
    fontSize: 16,
    fontWeight: '500',
  },
  sessionTitleActive: {
    color: COLORS.fg,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: SIDEBAR_PADDING,
    gap: 12,
  },
  emptyText: {
    color: COLORS.fgMuted,
    fontSize: 14,
  },
});
