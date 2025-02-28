import { chat, saveChatDebounced } from "../../../../../script.js";
import { debug } from "../lib/utils.js";

import { jsonToYAML, yamlToJSON } from "../lib/ymlParser.js";
import { TrackerPreviewManager } from "./ui/trackerPreviewManager.js";

export const FIELD_INCLUDE_OPTIONS = {
	DYNAMIC: "dynamic",
	STATIC: "static",
	ALL: "all",
};

export const OUTPUT_FORMATS = {
	JSON: "json",
	YAML: "yaml",
};

export const FIELD_PRESENCE_OPTIONS = {
	DYNAMIC: "DYNAMIC",
	EPHEMERAL: "EPHEMERAL",
	STATIC: "STATIC",
};

// Handlers for different field types
const FIELD_TYPES_HANDLERS = {
	STRING: handleString,
	ARRAY: handleArray,
	OBJECT: handleObject,
	FOR_EACH_OBJECT: handleForEachObject,
	FOR_EACH_ARRAY: handleForEachArray,
	ARRAY_OBJECT: handleObject, // Treat ARRAY_OBJECT as OBJECT
};

/**
 * Saves the updated tracker data to the chat object.
 *
 * @param {Object} tracker - The new tracker data to be saved.
 * @param {Object} backendObj - The backend object used for retrieving and updating the tracker.
 * @param {string} mesId - The message ID used to locate the original tracker in the chat object.
 */
export function saveTracker(tracker, backendObj, mesId, useUpdatedExtraFieldsAsSource = false) {
	const originalTracker = getTracker(chat[mesId].tracker, backendObj, FIELD_INCLUDE_OPTIONS.ALL, true, OUTPUT_FORMATS.JSON);
	const updatedTracker = updateTracker(originalTracker, tracker, backendObj, true, OUTPUT_FORMATS.JSON, useUpdatedExtraFieldsAsSource);
	chat[mesId].tracker = updatedTracker;

	saveChatDebounced();
	TrackerPreviewManager.updatePreview(mesId);

	return updatedTracker;
}

/**
 * Generates example trackers using the example values from the backendObject.
 * @param {Object} backendObject - The backend object defining the tracker structure.
 * @param {string} includeFields - Which fields to include ('dynamic', 'static', 'all').
 * @param {string} outputFormat - The desired output format ('json' or 'yaml').
 * @returns {Array} - An array of example trackers in the specified format.
 */
export function getExampleTrackers(backendObject, includeFields = FIELD_INCLUDE_OPTIONS.DYNAMIC, outputFormat = OUTPUT_FORMATS.JSON) {
	const trackers = [];
	const numExamples = getMaxExampleCount(backendObject);

	for (let i = 0; i < numExamples; i++) {
		const tracker = {};
		processFieldExamples(backendObject, tracker, includeFields, i);
		trackers.push(formatOutput(tracker, outputFormat));
	}

	return trackers;
}

/**
 * Generates a default tracker using default values from the backendObject.
 * @param {Object} backendObject - The backend object defining the tracker structure.
 * @param {string} includeFields - Which fields to include ('dynamic', 'static', 'all').
 * @param {string} outputFormat - The desired output format ('json' or 'yaml').
 * @returns {Object|string} - The default tracker in the specified format.
 */
export function getDefaultTracker(backendObject, includeFields = FIELD_INCLUDE_OPTIONS.DYNAMIC, outputFormat = OUTPUT_FORMATS.JSON) {
	const tracker = {};
	processFieldDefaults(backendObject, tracker, includeFields);
	return formatOutput(tracker, outputFormat);
}

/**
 * Converts a tracker to match the backendObject structure, filling missing fields with defaults.
 * @param {Object|string} trackerInput - The tracker object or YAML string.
 * @param {Object} backendObject - The backend object defining the tracker structure.
 * @param {string} includeFields - Which fields to include ('dynamic', 'static', 'all').
 * @param {boolean} includeUnmatchedFields - Whether to include unmatched fields in '_extraFields'.
 * @param {string} outputFormat - The desired output format ('json' or 'yaml').
 * @returns {Object|string} - The reconciled tracker in the specified format.
 */
export function getTracker(trackerInput, backendObject, includeFields = FIELD_INCLUDE_OPTIONS.DYNAMIC, includeUnmatchedFields = true, outputFormat = OUTPUT_FORMATS.JSON) {
	debug("Getting tracker:", { trackerInput, backendObject, includeFields, includeUnmatchedFields, outputFormat });
	let tracker = typeof trackerInput === "string" ? yamlToJSON(trackerInput) : trackerInput;
	const reconciledTracker = {};
	let extraFields = {};

	reconcileTracker(tracker, backendObject, reconciledTracker, extraFields, includeFields);

	if (includeUnmatchedFields) {
		extraFields = cleanEmptyObjects(extraFields);
		if ((typeof extraFields === "object" && Object.keys(extraFields).length > 0) || typeof extraFields === "string") {
			reconciledTracker._extraFields = extraFields;
		}
	}

	return formatOutput(reconciledTracker, outputFormat);
}

/**
 * Generates a tracker prompt string from the backendObject.
 * @param {Object} backendObject - The backend object defining the tracker structure.
 * @param {string} includeFields - Which fields to include ('dynamic', 'static', 'all').
 * @returns {string} - The tracker prompt string.
 */
export function getTrackerPrompt(backendObject, includeFields = FIELD_INCLUDE_OPTIONS.DYNAMIC) {
	const lines = [];
	buildPrompt(backendObject, includeFields, 0, lines, true);
	return lines.join("\n").trim();
}

/**
 * Updates an existing tracker with a new one, reconciling nested fields and '_extraFields'.
 * @param {Object|string} tracker - The existing tracker object or YAML string.
 * @param {Object|string} updatedTrackerInput - The updated tracker object or YAML string.
 * @param {Object} backendObject - The backend object defining the tracker structure.
 * @param {boolean} includeUnmatchedFields - Whether to include unmatched fields in '_extraFields'.
 * @param {string} outputFormat - The desired output format ('json' or 'yaml').
 * @returns {Object|string} - The updated tracker in the specified format.
 */
export function updateTracker(tracker, updatedTrackerInput, backendObject, includeUnmatchedFields = true, outputFormat = OUTPUT_FORMATS.JSON, useUpdatedExtraFieldsAsSource = false) {
	debug("Updating tracker:", { tracker, updatedTrackerInput, backendObject, includeUnmatchedFields, outputFormat });
	tracker = typeof tracker === "string" ? yamlToJSON(tracker) : tracker;
	const updatedTracker = typeof updatedTrackerInput === "string" ? yamlToJSON(updatedTrackerInput) : updatedTrackerInput;

	const finalTracker = {};
	let extraFields = {};

	reconcileUpdatedTracker(tracker, updatedTracker, backendObject, finalTracker, extraFields, "", includeUnmatchedFields, useUpdatedExtraFieldsAsSource);

	if (includeUnmatchedFields && !useUpdatedExtraFieldsAsSource) {
		extraFields = cleanEmptyObjects(extraFields);
		if ((typeof extraFields === "object" && Object.keys(extraFields).length > 0) || typeof extraFields === "string") {
			finalTracker._extraFields = extraFields;
		}
	} else if (useUpdatedExtraFieldsAsSource && updatedTracker._extraFields) {
		finalTracker._extraFields = updatedTracker._extraFields; // Directly use `_extraFields` from updatedTracker
	}

	return formatOutput(finalTracker, outputFormat);
}

/**
 * Checks if the given tracker is non-empty and contains at least one field that differs from the default. Uses Lodash for deep equality checks.
 * @param {Object|string} trackerInput - The tracker object or YAML string.
 * @param {Object} backendObject - The backend object defining the tracker structure.
 * @param {string} includeFields - Which fields to include ('dynamic', 'static', 'all').
 * @returns {boolean} - `true` if the tracker has at least one non-default field, otherwise `false`.
 */
export function trackerExists(trackerInput, backendObject) {
	if(typeof trackerInput === "undefined" || trackerInput === null) return false;

	// Convert YAML string to JSON if necessary
	let tracker = typeof trackerInput === "string" ? yamlToJSON(trackerInput) : trackerInput;

	// Get the default tracker structure
	let defaultTracker = getDefaultTracker(backendObject, FIELD_INCLUDE_OPTIONS.ALL, OUTPUT_FORMATS.JSON);

	// Remove empty fields from both tracker and default to prevent false negatives
	tracker = _.omitBy(tracker, _.isEmpty);
	defaultTracker = _.omitBy(defaultTracker, _.isEmpty);

	// If tracker is empty after cleaning, it doesn't exist
	if (_.isEmpty(tracker)) return false;

	// If all fields in tracker match the defaults, return false (it’s effectively empty)
	if (_.isEqual(tracker, defaultTracker)) return false;

	return true;
}

/**
 * Cleans a tracker by removing fields that match the default values.
 * @param {Object|string} trackerInput - The tracker object or YAML string.
 * @param {Object} backendObject - The backend object defining the tracker structure.
 * @param {string} includeFields - Which fields to include ('dynamic', 'static', 'all').
 * @param {string} outputFormat - The desired output format ('json' or 'yaml').
 * @param {boolean} preserveStructure - If true, replaces default values with placeholders (object keys remain).
 * @returns {Object|string} - A cleaned tracker in the specified format.
 */
export function cleanTracker(trackerInput, backendObject, outputFormat = OUTPUT_FORMATS.JSON, preserveStructure = false) {
	// Convert YAML to JSON if needed
	const tracker = typeof trackerInput === "string" ? yamlToJSON(trackerInput) : trackerInput;

	// Get the default tracker in JSON form
	const defaultTracker = getDefaultTracker(backendObject, FIELD_INCLUDE_OPTIONS.ALL, OUTPUT_FORMATS.JSON);

	// 1) Recursively remove default values
	let cleaned = removeDefaults(tracker, defaultTracker, preserveStructure);

	// If the entire tracker was removed, return empty object or {} so we don't break usage
	if (typeof cleaned === "undefined"){
		if(outputFormat === OUTPUT_FORMATS.YAML){
			return "";
		} else if(outputFormat === OUTPUT_FORMATS.JSON){
			return {};
		}
	}

	// 2) Return in the specified output format
	return formatOutput(cleaned, outputFormat);
}

/* Helper Functions */

function getMaxExampleCount(backendObject) {
	let maxCount = 0;
	function traverse(obj) {
		Object.values(obj).forEach((field) => {
			if (field.exampleValues) {
				maxCount = Math.max(maxCount, field.exampleValues.length);
			}
			if (field.nestedFields) {
				traverse(field.nestedFields);
			}
		});
	}
	traverse(backendObject);
	return maxCount;
}

function processFieldExamples(backendObj, trackerObj, includeFields, exampleIndex) {
	for (const field of Object.values(backendObj)) {
		if (!shouldIncludeField(field, includeFields, true)) continue;

		const handler = FIELD_TYPES_HANDLERS[field.type] || handleString;
		trackerObj[field.name] = handler(field, includeFields, exampleIndex, null, null, null, true);
	}
}

function processFieldDefaults(backendObj, trackerObj, includeFields) {
	for (const field of Object.values(backendObj)) {
		if (!shouldIncludeField(field, includeFields, true)) continue;

		const handler = FIELD_TYPES_HANDLERS[field.type] || handleString;
		trackerObj[field.name] = handler(field, includeFields, null, null, null, null, true);
	}
}

function reconcileTracker(trackerInput, backendObj, reconciledObj, extraFields, includeFields) {
	for (const field of Object.values(backendObj)) {
		if (!shouldIncludeField(field, includeFields)) continue;

		const fieldName = field.name;
		const trackerValue = trackerInput[fieldName];
		const handler = FIELD_TYPES_HANDLERS[field.type] || handleString;
		reconciledObj[fieldName] = handler(field, includeFields, null, trackerValue, extraFields);
	}

	// Handle extra fields
	for (const key in trackerInput) {
		if (!Object.prototype.hasOwnProperty.call(reconciledObj, key) && key !== "_extraFields") {
			extraFields[key] = trackerInput[key]; // Preserve original structure and data type
		}
	}

	// Reconcile _extraFields
	if (trackerInput._extraFields !== undefined) {
		extraFields = mergeExtraFields(extraFields, trackerInput._extraFields);
	}
}

function reconcileUpdatedTracker(tracker, updatedTracker, backendObj, finalTracker, extraFields, fieldPath = "", includeUnmatchedFields, useUpdatedExtraFieldsAsSource = false) {
	for (const field of Object.values(backendObj)) {
		const fieldName = field.name;
		const handler = FIELD_TYPES_HANDLERS[field.type] || handleString;
		const trackerValue = tracker[fieldName];
		const updatedValue = updatedTracker[fieldName];

		debug("Reconciling field:", { fieldName, fieldPath, trackerValue, updatedValue });
		finalTracker[fieldName] = handler(field, FIELD_INCLUDE_OPTIONS.ALL, null, updatedValue !== undefined ? updatedValue : trackerValue, extraFields);
	}

	if (includeUnmatchedFields) {
		for (const key in updatedTracker) {
			if (!Object.prototype.hasOwnProperty.call(finalTracker, key) && key !== "_extraFields") {
				extraFields[key] = updatedTracker[key]; // Preserve original structure and data type
			}
		}

		if (!useUpdatedExtraFieldsAsSource) {
			// Handle extra fields from the original tracker
			for (const key in tracker) {
				if (!Object.prototype.hasOwnProperty.call(finalTracker, key) && !Object.prototype.hasOwnProperty.call(extraFields, key) && key !== "_extraFields") {
					extraFields[key] = tracker[key]; // Preserve original structure and data type
				}
			}
		}
	}

	if (useUpdatedExtraFieldsAsSource && updatedTracker._extraFields) {
		extraFields = updatedTracker._extraFields; // Override with updatedTracker's `_extraFields`
	} else if (!useUpdatedExtraFieldsAsSource) {
		extraFields = mergeExtraFields(extraFields, tracker._extraFields);
		extraFields = mergeExtraFields(extraFields, updatedTracker._extraFields);
	}
}

function shouldIncludeField(field, includeFields, includeEphemeral = false) {
	if (includeFields === FIELD_INCLUDE_OPTIONS.ALL) return true;
	if (includeFields === FIELD_INCLUDE_OPTIONS.DYNAMIC && (field.presence === FIELD_PRESENCE_OPTIONS.DYNAMIC || (field.presence === FIELD_PRESENCE_OPTIONS.EPHEMERAL && includeEphemeral))) return true;
	if (includeFields === FIELD_INCLUDE_OPTIONS.STATIC && field.presence === FIELD_PRESENCE_OPTIONS.STATIC) return true;
	return false;
}

function handleString(field, includeFields, index = null, trackerValue = null, extraFields = null, charIndex = null, includeEphemeral = false) {
	if (trackerValue !== null && typeof trackerValue === "string" && trackerValue !== "") {
		return trackerValue;
	} else if (trackerValue !== null) {
		// Type mismatch
		if (extraFields && typeof extraFields === "object") {
			extraFields[field.name] = trackerValue;
		}
	}

	// If we have exampleValues and index, try parsing
	if (index !== null && field.exampleValues && field.exampleValues[index]) {
		const val = field.exampleValues[index];
		try {
			const arr = JSON.parse(val);
			if (Array.isArray(arr)) {
				if (charIndex !== null && charIndex < arr.length) {
					return arr[charIndex];
				}
				return arr[0];
			}
			return val;
		} catch {
			return val;
		}
	}

	return field.defaultValue || "Updated if Changed";
}

function handleArray(field, includeFields, index = null, trackerValue = null, extraFields = null, charIndex = null, includeEphemeral = false) {
	if (trackerValue !== null && Array.isArray(trackerValue)) {
		return trackerValue;
	} else if (trackerValue !== null) {
		// Type mismatch detected
		if (extraFields && typeof extraFields === "object") {
			extraFields[field.name] = trackerValue;
		}
	}

	let value;
	if (index !== null && field.exampleValues && field.exampleValues[index]) {
		try {
			const arr = JSON.parse(field.exampleValues[index]);
			if (Array.isArray(arr)) {
				if (charIndex !== null && charIndex < arr.length) {
					return arr[charIndex];
				}
				// If no charIndex or out of range, return the whole array or first element
				return arr;
			} else {
				value = arr;
			}
		} catch {
			value = field.exampleValues[index];
		}
	} else {
		try {
			const parsedValue = JSON.parse(field.defaultValue);
			value = Array.isArray(parsedValue) ? parsedValue : [parsedValue];
		} catch {
			value = field.defaultValue ? [field.defaultValue] : [];
		}
	}
	return value;
}

function handleObject(field, includeFields, index = null, trackerValue = null, extraFields = null, charIndex = null, includeEphemeral = false) {
	const obj = {};
	const nestedFields = field.nestedFields || {};

	if (trackerValue !== null && typeof trackerValue === "object" && !Array.isArray(trackerValue)) {
		// Process nested fields
		for (const nestedField of Object.values(nestedFields)) {
			if (!shouldIncludeField(nestedField, includeFields, includeEphemeral)) continue;
			const handler = FIELD_TYPES_HANDLERS[nestedField.type] || handleString;
			const nestedValue = trackerValue[nestedField.name];
			obj[nestedField.name] = handler(nestedField, includeFields, null, nestedValue, extraFields && typeof extraFields === "object" ? extraFields : null, charIndex, includeEphemeral);
		}

		// Handle extra fields in the nested object
		for (const key in trackerValue) {
			if (!Object.prototype.hasOwnProperty.call(obj, key)) {
				if (extraFields && typeof extraFields === "object") {
					extraFields[field.name] = extraFields[field.name] || {};
					extraFields[field.name][key] = trackerValue[key];
				}
			}
		}
	} else {
		if (trackerValue !== null && typeof extraFields === "object") {
			extraFields[field.name] = trackerValue;
		}
		// Use default values
		for (const nestedField of Object.values(nestedFields)) {
			if (!shouldIncludeField(nestedField, includeFields, includeEphemeral)) continue;
			const handler = FIELD_TYPES_HANDLERS[nestedField.type] || handleString;
			obj[nestedField.name] = handler(nestedField, includeFields, index, null, extraFields, charIndex, includeEphemeral);
		}
	}

	return obj;
}

function handleForEachObject(field, includeFields, index = null, trackerValue = null, extraFields = null, charIndex = null, includeEphemeral = false) {
	const nestedFields = field.nestedFields || {};
	let keys = [];

	// Parse the main field's example values into keys
	if (index !== null && field.exampleValues && field.exampleValues[index]) {
		try {
			keys = JSON.parse(field.exampleValues[index]);
		} catch {
			keys = [field.defaultValue || "default"];
		}
	} else {
		keys = [field.defaultValue || "default"];
	}

	// If trackerValue is correct structure, reconcile it. Otherwise, build defaults.
	if (trackerValue !== null && typeof trackerValue === "object" && !Array.isArray(trackerValue)) {
		// Process existing trackerValue
		const result = {};
		for (const [key, value] of Object.entries(trackerValue)) {
			const obj = {};
			let extraNestedFields = null;

			for (const nestedField of Object.values(nestedFields)) {
				if (!shouldIncludeField(nestedField, includeFields, includeEphemeral)) continue;
				const handler = FIELD_TYPES_HANDLERS[nestedField.type] || handleString;
				const nestedValue = value[nestedField.name];
				obj[nestedField.name] = handler(nestedField, includeFields, null, nestedValue, extraNestedFields, null, includeEphemeral);
			}

			// Handle extra fields in the nested object
			for (const nestedKey in value) {
				if (!Object.prototype.hasOwnProperty.call(obj, nestedKey)) {
					if (extraFields && typeof extraFields === "object") {
						extraNestedFields = extraNestedFields || {};
						extraNestedFields[nestedKey] = value[nestedKey];
					}
				}
			}

			if (extraFields && extraNestedFields) {
				extraFields[field.name] = extraFields[field.name] || {};
				extraFields[field.name][key] = extraNestedFields;
			}

			result[key] = obj;
		}
		return result;
	} else {
		if (trackerValue !== null && typeof extraFields === "object" && typeof trackerValue !== "object") {
			// Type mismatch: place the original trackerValue into extraFields
			extraFields[field.name] = trackerValue;
		}

		const result = {};
		// For each key, build an object of nested fields
		for (let cIndex = 0; cIndex < keys.length; cIndex++) {
			const characterName = keys[cIndex];
			const obj = {};
			for (const nestedField of Object.values(nestedFields)) {
				if (!shouldIncludeField(nestedField, includeFields, includeEphemeral)) continue;
				const handler = FIELD_TYPES_HANDLERS[nestedField.type] || handleString;
				obj[nestedField.name] = handler(nestedField, includeFields, index, null, extraFields, cIndex, includeEphemeral);
			}
			result[characterName] = obj;
		}
		return result;
	}
}

function handleForEachArray(field, includeFields, index = null, trackerValue = null, extraFields = null, charIndex = null, includeEphemeral = false) {
	const nestedFields = field.nestedFields || {};

	const nestedFieldArray = Object.values(nestedFields);
	const singleStringField = nestedFieldArray.length === 1 && nestedFieldArray[0].type === "STRING";

	let keys = [];
	if (index !== null && field.exampleValues && field.exampleValues[index]) {
		try {
			keys = JSON.parse(field.exampleValues[index]);
		} catch {
			keys = [field.defaultValue || "default"];
		}
	} else {
		keys = [field.defaultValue || "default"];
	}

	if (trackerValue !== null && typeof trackerValue === "object" && !Array.isArray(trackerValue)) {
		const result = {};
		for (const [key, value] of Object.entries(trackerValue)) {
			if (!Array.isArray(value)) {
				if (extraFields && typeof extraFields === "object") {
					extraFields[field.name] = extraFields[field.name] || {};
					extraFields[field.name][key] = value;
				}
				result[key] = singleStringField ? [] : [];
				continue;
			}

			if (singleStringField) {
				const filteredValues = [];
				for (const v of value) {
					if (typeof v === "string") {
						filteredValues.push(v);
					} else {
						if (extraFields && typeof extraFields === "object") {
							extraFields[field.name] = extraFields[field.name] || {};
							extraFields[field.name][key] = extraFields[field.name][key] || [];
							extraFields[field.name][key].push(v);
						}
					}
				}
				result[key] = filteredValues;
			} else {
				const arrayOfObjects = [];
				for (const arrItem of value) {
					if (typeof arrItem === "object" && !Array.isArray(arrItem)) {
						const obj = {};
						let extraNestedFields = null;
						for (const nf of nestedFieldArray) {
							if (!shouldIncludeField(nf, includeFields, includeEphemeral)) continue;
							const handler = FIELD_TYPES_HANDLERS[nf.type] || handleString;
							const arrItemVal = arrItem[nf.name];
							obj[nf.name] = handler(nf, includeFields, null, arrItemVal, extraNestedFields, null, includeEphemeral);
						}

						for (const nestedKey in arrItem) {
							if (!Object.prototype.hasOwnProperty.call(obj, nestedKey)) {
								extraNestedFields = extraNestedFields || {};
								extraNestedFields[nestedKey] = arrItem[nestedKey];
							}
						}

						if (extraNestedFields && extraFields && typeof extraFields === "object") {
							extraFields[field.name] = extraFields[field.name] || {};
							extraFields[field.name][key] = extraFields[field.name][key] || [];
							extraFields[field.name][key].push(extraNestedFields);
						}

						arrayOfObjects.push(obj);
					} else {
						if (extraFields && typeof extraFields === "object") {
							extraFields[field.name] = extraFields[field.name] || {};
							extraFields[field.name][key] = extraFields[field.name][key] || [];
							extraFields[field.name][key].push(arrItem);
						}
					}
				}
				result[key] = arrayOfObjects;
			}
		}
		return result;
	} else {
		if (trackerValue !== null && (typeof trackerValue !== "object" || Array.isArray(trackerValue))) {
			if (extraFields && typeof extraFields === "object") {
				extraFields[field.name] = trackerValue;
			}
		}

		const result = {};
		for (let cIndex = 0; cIndex < keys.length; cIndex++) {
			const characterName = keys[cIndex];

			if (singleStringField) {
				const nf = nestedFieldArray[0];
				const handler = FIELD_TYPES_HANDLERS[nf.type] || handleString;

				let defaultArray = [];
				if (index !== null && nf.exampleValues && nf.exampleValues[index]) {
					try {
						const val = nf.exampleValues[index];
						const parsed = JSON.parse(val);
						if (Array.isArray(parsed)) {
							defaultArray = parsed.map((item) => (typeof item === "string" ? item : String(item)));
						} else {
							defaultArray = [String(val)];
						}
					} catch {
						defaultArray = [nf.exampleValues[index]];
					}
				} else if (nf.defaultValue) {
					try {
						const parsed = JSON.parse(nf.defaultValue);
						if (Array.isArray(parsed)) {
							defaultArray = parsed.map((item) => (typeof item === "string" ? item : String(item)));
						} else {
							defaultArray = [String(nf.defaultValue)];
						}
					} catch {
						defaultArray = [nf.defaultValue];
					}
				} else {
					defaultArray = ["Updated if Changed"];
				}

				result[characterName] = defaultArray;
			} else {
				const arrItem = {};
				for (const nf of nestedFieldArray) {
					if (!shouldIncludeField(nf, includeFields, includeEphemeral)) continue;
					const handler = FIELD_TYPES_HANDLERS[nf.type] || handleString;
					arrItem[nf.name] = handler(nf, includeFields, index, null, extraFields, cIndex, includeEphemeral);
				}
				result[characterName] = [arrItem];
			}
		}

		return result;
	}
}

function buildPrompt(backendObj, includeFields, indentLevel, lines, includeEphemeral = false) {
	const indent = "  ".repeat(indentLevel);
	for (const field of Object.values(backendObj)) {
		if (!shouldIncludeField(field, includeFields, includeEphemeral)) continue;
		if (!field.prompt && !field.nestedFields) continue;

		if (field.type === "FOR_EACH_OBJECT" || field.nestedFields) {
			lines.push(`${indent}- **${field.name}:**${field.prompt ? " " + field.prompt : ""}`);
			buildPrompt(field.nestedFields, includeFields, indentLevel + 1, lines, includeEphemeral);
		} else {
			lines.push(`${indent}- **${field.name}:** ${field.prompt}`);
		}
	}
}

function formatOutput(tracker, outputFormat) {
	if (outputFormat === OUTPUT_FORMATS.YAML) {
		return jsonToYAML(tracker);
	}
	return tracker;
}

// Utility function to merge objects deeply or concatenate strings
function mergeExtraFields(extraFields, existingExtra) {
	if (existingExtra === undefined || existingExtra === null) {
		return extraFields;
	}

	if (typeof existingExtra === "object") {
		if (typeof extraFields === "object") {
			mergeDeep(extraFields, existingExtra);
			return extraFields;
		} else if (typeof extraFields === "string") {
			return extraFields + JSON.stringify(existingExtra);
		} else {
			return existingExtra;
		}
	} else if (typeof existingExtra === "string") {
		if (typeof extraFields === "object") {
			return JSON.stringify(extraFields) + existingExtra;
		} else if (typeof extraFields === "string") {
			return extraFields + existingExtra;
		} else {
			return existingExtra;
		}
	} else {
		return extraFields;
	}
}

// Utility function to merge objects deeply
function mergeDeep(target, source) {
	for (const key in source) {
		if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
			if (!target[key] || typeof target[key] !== "object") {
				target[key] = {};
			}
			mergeDeep(target[key], source[key]);
		} else {
			target[key] = source[key];
		}
	}
}

// Utility function to remove empty objects from extraFields
function cleanEmptyObjects(obj) {
	if (typeof obj !== "object" || obj === null) return obj;

	for (const key in obj) {
		if (typeof obj[key] === "object") {
			obj[key] = cleanEmptyObjects(obj[key]);
			if (obj[key] !== null && typeof obj[key] === "object" && Object.keys(obj[key]).length === 0) {
				delete obj[key];
			}
		}
	}

	return obj;
}

function removeDefaults(currentValue, defaultValue, preserveStructure) {
	if (_.isArray(currentValue) && _.isArray(defaultValue)) {
		return cleanArray(currentValue, defaultValue, preserveStructure);
	}

	if (_.isPlainObject(currentValue) && _.isPlainObject(defaultValue)) {
		return cleanObject(currentValue, defaultValue, preserveStructure);
	}

	if (_.isEqual(currentValue, defaultValue)) {
		return preserveStructure ? getEmptyEquivalent(currentValue) : undefined;
	}

	return currentValue;
}

function cleanArray(arr, defaultArr, preserveStructure) {
	const cleanedItems = [];

	for (let item of arr) {
		const isDefaultItem = defaultArr.some((defItem) => _.isEqual(item, defItem));
		if (isDefaultItem) continue;

		cleanedItems.push(item);
	}

	if (cleanedItems.length === 0 && !preserveStructure) {
		return undefined;
	}

	return cleanedItems;
}

function cleanObject(obj, defaultObj, preserveStructure) {
	let hasRemainingKeys = false;
	const result = {};

	for (let key in obj) {
		if (!obj.hasOwnProperty(key)) continue;

		const defaultValForKey = defaultObj.hasOwnProperty(key) ? defaultObj[key] : getEmptyEquivalent(obj[key]);

		const cleanedValue = removeDefaults(obj[key], defaultValForKey, preserveStructure);

		if (typeof cleanedValue !== "undefined") {
			hasRemainingKeys = true;
			result[key] = cleanedValue;
		} else if (preserveStructure) {
			hasRemainingKeys = true;
			result[key] = getEmptyEquivalent(obj[key]);
		}
	}

	if (!hasRemainingKeys && !preserveStructure) {
		return undefined;
	}

	return result;
}

function getEmptyEquivalent(value) {
	if (_.isString(value)) return "";
	if (_.isArray(value)) return [];
	if (_.isObject(value)) return {};
	return null;
}
