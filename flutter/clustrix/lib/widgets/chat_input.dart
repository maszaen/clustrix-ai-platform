import 'package:flutter/material.dart';
import '../constants/colors.dart';
import '../constants/fonts.dart';

/// Chat input widget - EXACT MATCH RN ChatInput.js styling
class ChatInput extends StatefulWidget {
  final VoidCallback? onSend;
  final bool isStreaming;
  final VoidCallback? onStop;
  final VoidCallback? onOpenAttachmentModal;
  final String placeholder;
  final TextEditingController? controller;

  const ChatInput({
    super.key,
    this.onSend,
    this.isStreaming = false,
    this.onStop,
    this.onOpenAttachmentModal,
    this.placeholder = 'Ask anything',
    this.controller,
  });

  @override
  State<ChatInput> createState() => _ChatInputState();
}

class _ChatInputState extends State<ChatInput> {
  late TextEditingController _controller;
  
  @override
  void initState() {
    super.initState();
    _controller = widget.controller ?? TextEditingController();
  }

  bool get _hasContent => _controller.text.trim().isNotEmpty;

  void _handleSend() {
    if (!_hasContent || widget.isStreaming) return;
    widget.onSend?.call();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      // wrapper style: paddingBottom: 27, paddingHorizontal: 16
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 27),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Bottom fade gradient (bottomFade style)
          Positioned(
            bottom: -37,
            left: -16,
            right: -16,
            child: IgnorePointer(
              child: Container(
                height: 112,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      AppColors.bg70,
                      AppColors.bg90,
                      AppColors.bg90,
                    ],
                    stops: const [0, 0.45, 0.6, 1],
                  ),
                ),
              ),
            ),
          ),
          
          // Add button (addBtn style)
          // position: absolute, left: 16, bottom: 27, width: 45, height: 45
          Positioned(
            left: 0,
            bottom: 0,
            child: Material(
              color: AppColors.inputBg,
              borderRadius: BorderRadius.circular(50),
              child: InkWell(
                onTap: widget.onOpenAttachmentModal,
                borderRadius: BorderRadius.circular(50),
                child: Container(
                  width: 45,
                  height: 45,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(50),
                    border: Border.all(color: AppColors.borderLight),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    Icons.add,
                    size: 27,
                    color: AppColors.icon,
                  ),
                ),
              ),
            ),
          ),
          
          // Input container (containerInput style)
          // marginLeft: 53, borderRadius: 22
          Container(
            margin: const EdgeInsets.only(left: 53),
            decoration: BoxDecoration(
              color: AppColors.inputBg,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: AppColors.borderLight),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // Input field (input style)
                Expanded(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 150),
                    child: TextField(
                      controller: _controller,
                      onChanged: (_) => setState(() {}),
                      style: const TextStyle(
                        fontFamily: AppFonts.sans,
                        fontSize: 15,
                        color: AppColors.fg,
                        height: 1.33, // lineHeight: 20 / fontSize: 15
                      ),
                      maxLines: null,
                      decoration: InputDecoration(
                        hintText: widget.placeholder,
                        hintStyle: const TextStyle(color: AppColors.fgMuted),
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.fromLTRB(13, 10, 0, 10),
                        isDense: true,
                      ),
                      onSubmitted: (_) => _handleSend(),
                    ),
                  ),
                ),
                
                // Send/Stop button
                Padding(
                  padding: const EdgeInsets.fromLTRB(0, 4, 4, 4),
                  child: widget.isStreaming
                      ? _buildStopButton()
                      : _buildSendButton(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSendButton() {
    // sendButton style: width: 34, height: 34, borderRadius: 28
    return Material(
      color: _hasContent ? AppColors.accent : AppColors.surface,
      borderRadius: BorderRadius.circular(28),
      child: InkWell(
        onTap: _hasContent ? _handleSend : null,
        borderRadius: BorderRadius.circular(28),
        child: Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          child: const Icon(
            Icons.arrow_upward,
            size: 20,
            color: AppColors.icon,
          ),
        ),
      ),
    );
  }

  Widget _buildStopButton() {
    // stopButton style: width: 36, height: 36, borderRadius: 28
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(28),
      child: InkWell(
        onTap: widget.onStop,
        borderRadius: BorderRadius.circular(28),
        child: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          child: const Icon(
            Icons.stop,
            size: 20,
            color: AppColors.fg,
          ),
        ),
      ),
    );
  }
}
