import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shimmer/shimmer.dart';
import '../constants/colors.dart';
import '../constants/fonts.dart';
import '../providers/app_provider.dart';
import '../models/message.dart';
import 'chat_message.dart';
import 'chat_input.dart';

/// Chat view - EXACT MATCH RN ChatScreen layout
/// Messages list dengan inputContainer (position absolute, bottom 0)
class ChatView extends StatefulWidget {
  const ChatView({super.key});

  @override
  State<ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<ChatView> with TickerProviderStateMixin {
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  
  late AnimationController _skeletonController;
  late Animation<double> _skeletonOpacity;
  bool _showSkeleton = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    
    _skeletonController = AnimationController(
      duration: const Duration(milliseconds: 200),
      vsync: this,
    );
    _skeletonOpacity = Tween<double>(begin: 1.0, end: 0.0).animate(_skeletonController);
  }

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    _skeletonController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels < 200) {
      final appProvider = context.read<AppProvider>();
      if (appProvider.hasMoreMessages && !appProvider.isLoadingMore) {
        appProvider.loadMoreMessages();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.of(context).padding.top;
    
    return Consumer<AppProvider>(
      builder: (context, appProvider, _) {
        final messages = appProvider.messages;
        final isLoading = appProvider.isLoadingSession;

        // Handle skeleton visibility
        if (isLoading && !_showSkeleton) {
          setState(() => _showSkeleton = true);
          _skeletonController.value = 0;
        } else if (!isLoading && _showSkeleton) {
          _skeletonController.forward().then((_) {
            if (mounted) setState(() => _showSkeleton = false);
          });
        }

        // RN structure:
        // <View style={styles.container}>
        //   <LegendList ... contentContainerStyle={{ paddingTop: topInset + 66 }} />
        //   <View style={styles.inputContainer}> // position: absolute, bottom: 0
        //     <ChatInput ... />
        //   </View>
        //   {showSkeleton && <Skeleton ... />}
        // </View>

        return Stack(
          children: [
            // Messages list atau empty state
            if (messages.isEmpty && !isLoading)
              const SizedBox.expand()
            else
              Positioned.fill(
                child: _buildMessageList(messages, appProvider, topInset),
              ),
            
            // inputContainer: position: 'absolute', bottom: 0, left: 0, right: 0
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: ChatInput(
                controller: _inputController,
                isStreaming: appProvider.isStreaming,
                placeholder: 'Reply...',
                onSend: _handleSend,
                onStop: _handleStop,
                onOpenAttachmentModal: () {
                  // TODO: Open attachment modal
                },
              ),
            ),
            
            // Skeleton overlay - zIndex: 4
            if (_showSkeleton)
              Positioned.fill(
                child: FadeTransition(
                  opacity: ReverseAnimation(_skeletonOpacity),
                  child: _buildSkeletonLoader(topInset),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _buildSkeletonLoader(double topInset) {
    // skeletonContainer: position: absolute, bg, padding: 16, paddingTop: topInset + 70
    return Container(
      color: AppColors.bg,
      padding: EdgeInsets.fromLTRB(16, topInset + 70, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // skeletonUser: alignSelf: 'flex-end', width: '70%', height: 60, borderRadius: 16
          Shimmer.fromColors(
            baseColor: AppColors.skeleton,
            highlightColor: const Color(0xFF3a3a3a),
            child: Container(
              width: MediaQuery.of(context).size.width * 0.7,
              height: 60,
              decoration: BoxDecoration(
                color: AppColors.skeleton,
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          const SizedBox(height: 16),
          // skeletonAi: width: '100%', height: 350, borderRadius: 16
          Shimmer.fromColors(
            baseColor: AppColors.skeleton,
            highlightColor: const Color(0xFF3a3a3a),
            child: Container(
              width: double.infinity,
              height: 350,
              decoration: BoxDecoration(
                color: AppColors.skeleton,
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList(List<Message> messages, AppProvider appProvider, double topInset) {
    // contentContainerStyle: { paddingLeft: 0, paddingTop: topInset + 66 }
    // ListFooter: height: 85 (untuk ruang input)
    return ListView.builder(
      controller: _scrollController,
      padding: EdgeInsets.only(
        top: topInset + 66,
        bottom: 85, // Ruang untuk input
      ),
      itemCount: messages.length + (appProvider.hasMoreMessages ? 1 : 0),
      itemBuilder: (context, index) {
        if (appProvider.hasMoreMessages && index == 0) {
          return _buildLoadMoreIndicator(appProvider);
        }
        
        final msgIndex = appProvider.hasMoreMessages ? index - 1 : index;
        final message = messages[msgIndex];
        
        return ChatMessage(
          message: message,
          key: ValueKey('msg-${message.messageIndex}-${message.role}'),
          onShowThinking: () {
            // TODO: Show thinking modal
          },
          onReact: (isLike) {
            appProvider.setMessageMetadata(
              appProvider.currentSession!.id,
              message.messageIndex,
              {'is_liked': isLike},
            );
          },
        );
      },
    );
  }

  Widget _buildLoadMoreIndicator(AppProvider appProvider) {
    // loadMoreContainer: padding: 16, flexDirection: 'row', gap: 4
    return Container(
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (appProvider.isLoadingMore) ...[
            const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.fgMuted,
              ),
            ),
            const SizedBox(width: 4),
          ],
          Text(
            appProvider.isLoadingMore ? 'Loading...' : 'Load earlier messages',
            style: const TextStyle(
              fontFamily: AppFonts.sans,
              fontSize: 14,
              color: AppColors.fgMuted,
            ),
          ),
        ],
      ),
    );
  }

  void _handleSend() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;
    
    final appProvider = context.read<AppProvider>();
    final session = appProvider.currentSession;
    if (session == null) return;
    
    _inputController.clear();
    
    final userMessage = Message(
      role: 'user',
      content: text,
      messageIndex: appProvider.messages.length,
      createdAt: DateTime.now().millisecondsSinceEpoch,
    );
    
    await appProvider.appendMessage(userMessage);
    
    // Scroll to bottom
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _handleStop() {
    // TODO: Stop streaming
  }
}
