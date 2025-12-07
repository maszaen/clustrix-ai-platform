import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import ContextMenu from './ContextMenu';
import ConfirmModal from './ConfirmModal';
import InputModal from './InputModal';

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

const PENCIL = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 1.22943C5.15604 1.22943 1.22943 5.15604 1.22943 10C1.22943 11.3437 1.53197 12.6189 2.07365 13.7592L2.40679 14.4596L3.80656 13.7942L3.47436 13.0939L3.31631 12.7371C2.97057 11.8938 2.77968 10.97 2.77968 10C2.77968 6.01243 6.01243 2.77968 10 2.77968C13.9876 2.77968 17.2203 6.01243 17.2203 10C17.2203 13.9876 13.9876 17.2203 10 17.2203C9.18341 17.2203 8.58586 17.1622 8.05603 17.0159C7.53403 16.8717 7.03891 16.6305 6.44615 16.2171C5.5775 15.6112 4.3323 15.3975 3.3059 16.0458L3.28981 16.0562L3.27372 16.0676L2.5904 16.5484L3.10431 18.0825L4.14444 17.35C4.51837 17.1207 5.07302 17.1507 5.5584 17.4891C6.26064 17.9789 6.91506 18.3092 7.64339 18.5103C8.36397 18.7093 9.11785 18.7706 10 18.7706C14.844 18.7706 18.7706 14.844 18.7706 10C18.7706 5.15604 14.844 1.22943 10 1.22943ZM9.2192 6.36949V9.22487H6.36949V10.7751H9.2192V13.6305H10.7694V10.7751H13.6305V9.22487H10.7694V6.36949H9.2192Z" fill="currentColor"></path></svg>';

function SessionItem({ session, isActive, onSelect, onLongPress, onToggleFavorite }) {
  return (
    <TouchableOpacity
      style={[styles.sessionItem, isActive && styles.sessionItemActive]}
      onPress={() => onSelect(session)}
      onLongPress={(e) => onLongPress(session, e.nativeEvent)}
      activeOpacity={0.7}
    >
      <Text 
        style={[styles.sessionTitle, isActive && styles.sessionTitleActive]} 
        numberOfLines={1}
      >
        {session.name || 'New Chat'}
      </Text>
      {/* <TouchableOpacity 
        style={styles.favoriteBtn}
        onPress={() => onToggleFavorite?.(session.id)}
        activeOpacity={0.7}
      >
        <Ionicons 
          name={session.is_favorite ? "star" : "star-outline"} 
          size={18} 
          color={session.is_favorite ? "#fbbf24" : COLORS.fgMuted} 
        />
      </TouchableOpacity> */}
    </TouchableOpacity>
  );
}

export default function SessionList({ sessions, currentSession, onSelect, onDelete, onRename, onToggleFavorite, onNew }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, session: null, position: { x: 0, y: 0 } });
  const [confirmDelete, setConfirmDelete] = useState({ visible: false, session: null });
  const [renameModal, setRenameModal] = useState({ visible: false, session: null, name: '' });

  const filteredSessions = searchQuery 
    ? sessions.filter(s => s.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

  // Separate favorites and regular sessions
  const favoriteSessions = filteredSessions.filter(s => s.is_favorite);
  const regularSessions = filteredSessions.filter(s => !s.is_favorite);

  const handleLongPress = (session, event) => {
    setContextMenu({
      visible: true,
      session,
      position: { x: event.pageX, y: event.pageY },
    });
  };

  const getContextOptions = () => {
    if (!contextMenu.session) return [];
    return [
      { label: 'Rename', icon: 'pencil-outline', onPress: () => setRenameModal({ visible: true, session: contextMenu.session, name: contextMenu.session.name || '' }) },
      { 
        label: contextMenu.session.is_favorite ? 'Unfavorite' : 'Favorite', 
        icon: contextMenu.session.is_favorite ? 'star' : 'star-outline', 
        onPress: () => onToggleFavorite?.(contextMenu.session.id) 
      },
      { label: 'Delete', icon: 'trash-outline', danger: true, onPress: () => setConfirmDelete({ visible: true, session: contextMenu.session }) },
    ];
  };

  return (
    <View style={[styles.container, { marginTop: 13 }]}>
      <ContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        options={getContextOptions()}
        onClose={() => setContextMenu({ ...contextMenu, visible: false })}
      />
      <ConfirmModal
        visible={confirmDelete.visible}
        title="Delete Chat"
        message={`Are you sure you want to delete "${confirmDelete.session?.name}"?`}
        confirmText="Delete"
        danger
        onConfirm={() => {
          onDelete(confirmDelete.session.id);
          setConfirmDelete({ visible: false, session: null });
        }}
        onCancel={() => setConfirmDelete({ visible: false, session: null })}
      />

      <View style={styles.headerRow}>
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
          {/* <Ionicons name="create-outline" size={24} color={COLORS.fg} /> */}
          <SvgXml xml={PENCIL} width={27} height={27} style={styles.newChatIcon} />
        </TouchableOpacity>
      </View>

      {/* Sessions */}
      <FlatList
        data={[...favoriteSessions, ...regularSessions]}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isFirstFavorite = index === 0 && favoriteSessions.length > 0;
          const isFirstRegular = index === favoriteSessions.length && regularSessions.length > 0 && favoriteSessions.length > 0;
          
          return (
            <>
              {isFirstFavorite && (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Favorites</Text>
                </View>
              )}
              {isFirstRegular && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent</Text>
                  </View>
                </>
              )}
              <SessionItem
                session={item}
                isActive={currentSession?.id === item.id}
                onSelect={onSelect}
                onLongPress={handleLongPress}
                onToggleFavorite={onToggleFavorite}
              />
            </>
          );
        }}
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
      
      <InputModal
        visible={renameModal.visible}
        title="Rename Chat"
        fields={[{ key: 'name', placeholder: 'Chat name', value: renameModal.session?.name || '', required: true }]}
        submitText="Save"
        onSubmit={(values) => {
          onRename?.(renameModal.session.id, values.name);
          setRenameModal({ visible: false, session: null, name: '' });
        }}
        onCancel={() => setRenameModal({ visible: false, session: null, name: '' })}
      />
    </View>
  );
}

const SIDEBAR_PADDING = 12;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIDEBAR_PADDING,
    gap: 10,
  },
  newChatBtn: {
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatIcon: {
    flexShrink: 0,
    color: COLORS.fg,
    width: 35,
    height: 35,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
    paddingTop: 20,
    paddingBottom: 20,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: SIDEBAR_PADDING+5,
    marginBottom: 2,
  },
  sessionItemActive: {
    backgroundColor: COLORS.hover,
  },
  sessionTitle: {
    flex: 1,
    color: COLORS.fgMuted,
    fontSize: 16,
    fontWeight: '500',
  },
  sessionTitleActive: {
    color: COLORS.fg,
  },
  favoriteBtn: {
    padding: 4,
  },
  sectionHeader: {
    paddingHorizontal: SIDEBAR_PADDING + 5,
    paddingVertical: 8,
  },
  sectionTitle: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: SIDEBAR_PADDING + 5,
    marginTop: 12,
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
