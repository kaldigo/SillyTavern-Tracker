import { chat } from "../../../../../script.js";
import { is_group_generating } from "../../../../../scripts/group-chats.js";
import { log } from "../lib/utils.js";
import { isEnabled } from "./settings/settings.js";
import { prepareMessageGeneration, addTrackerToMessage } from "./tracker.js";
import { updateTrackerPreview, showTrackerUI } from "./trackerUI.js";

/**
 * Event handler for when the chat changes.
 * @param {object} args - The event arguments.
 */
function onChatChanged(args) {
	$(document).off("mouseup touchend", "#show_more_messages", updateTrackerPreview);
	if (!isEnabled()) return;
	log("Chat changed:", args);
	if ($("#trackerUI").length > 0) {
		showTrackerUI();
	}
	updateTrackerPreview(true);
	$(document).on("mouseup touchend", "#show_more_messages", updateTrackerPreview);
}

/**
 * Event handler for after generation commands.
 * @param {string} type - The type of generation.
 * @param {object} options - Generation options.
 * @param {boolean} dryRun - Whether it's a dry run.
 */
async function onGenerateAfterCommands(type, options, dryRun) {
	if (!isEnabled() || chat.length == 0 || is_group_generating || (typeof type != "undefined" && !["continue", "swipe", "regenerate", "impersonate"].includes(type))) return;
	log("GENERATION_AFTER_COMMANDS ", [type, options, dryRun]);
	await prepareMessageGeneration(type, options, dryRun);
}

/**
 * Event handler for when a message is received.
 * @param {number} mesId - The message ID.
 */
async function onMessageReceived(mesId) {
	if (!isEnabled() || !chat[mesId] || (chat[mesId].tracker && Object.keys(chat[mesId].tracker).length !== 0)) return;
	log("MESSAGE_RECEIVED", mesId);
	await addTrackerToMessage(mesId);
}

/**
 * Event handler for when a message is sent.
 * @param {number} mesId - The message ID.
 */
async function onMessageSent(mesId) {
	if (!isEnabled() || !chat[mesId] || (chat[mesId].tracker && Object.keys(chat[mesId].tracker).length !== 0)) return;
	log("MESSAGE_SENT", mesId);
	await addTrackerToMessage(mesId);
}

/**
 * Event handler for when a character's message is rendered.
 */
async function onCharacterMessageRendered(mesId) {
	if (!isEnabled() || !chat[mesId] || (chat[mesId].tracker && Object.keys(chat[mesId].tracker).length !== 0)) return;
	log("CHARACTER_MESSAGE_RENDERED");
	await addTrackerToMessage(mesId);
	updateTrackerPreview();
}

/**
 * Event handler for when a user's message is rendered.
 */
async function onUserMessageRendered(mesId) {
	if (!isEnabled() || !chat[mesId] || (chat[mesId].tracker && Object.keys(chat[mesId].tracker).length !== 0)) return;
	log("USER_MESSAGE_RENDERED");
	await addTrackerToMessage(mesId);
	updateTrackerPreview();
}

export const eventHandlers = {
	onChatChanged,
	onGenerateAfterCommands,
	onMessageReceived,
	onMessageSent,
	onCharacterMessageRendered,
	onUserMessageRendered,
};
