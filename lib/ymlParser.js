// #region YAML to JSON Conversion

/**
 * Converts a YAML string to a JSON string.
 * @param {string} yaml - The YAML string to convert.
 * @returns {string} - The resulting JSON string.
 */
export function yamlToJSON(yaml) {
	const lines = yaml.split("\n");
	let result = {};
	let path = [];
	let currentIndent = -1;
	let inMultilineString = false;
	let multilineBuffer = "";

	for (let line of lines) {
		// Remove trailing whitespace
		line = line.trimEnd();

		// Skip empty lines and comments
		if (!inMultilineString && (line === "" || line.trim().startsWith("#"))) continue;

		// Handle multiline string continuation
		if (inMultilineString) {
			multilineBuffer += "\n" + line;
			if (line.trimEnd().endsWith('"')) {
				// End of multiline string
				setValueAtPath(result, path, multilineBuffer.slice(1, -1)); // Remove outer quotes
				inMultilineString = false;
				multilineBuffer = "";
			}
			continue;
		}

		// Determine the indentation level
		const indent = line.search(/\S|$/);
		const isListItem = line.trim().startsWith("- ");
		const keyValueSeparator = line.indexOf(": ");

		// Adjust the path based on indentation
		if (indent > currentIndent) {
			path.push("");
		} else if (indent < currentIndent) {
			path = path.slice(0, indent / 2 + 1);
		}
		currentIndent = indent;

		if (isListItem) {
			// Handle list items
			const value = line.trim().slice(2).trim();

			if (!Array.isArray(getValueAtPath(result, path))) {
				setValueAtPath(result, path, []);
			}

			const array = getValueAtPath(result, path);

			if (value.startsWith('"') && value.endsWith('"')) {
				array.push(value.slice(1, -1)); // Quoted string
			} else {
				array.push(parseValue(value));
			}
		} else if (keyValueSeparator !== -1) {
			// Handle key-value pairs
			const key = line.slice(0, keyValueSeparator).trim();
			let value = line.slice(keyValueSeparator + 1).trim();
            value = value.replace(/(?!#.*["'])#.*$/, "").trim();

			// Ignore values starting with ~
			if(value.startsWith("~")) continue;

			// Ignore comments after a key-value separator
			if (value.startsWith("#")) value = "";

			path[path.length - 1] = key;

			if (value.startsWith('"') && !value.endsWith('"')) {
				// Start of a multiline string
				inMultilineString = true;
				multilineBuffer = value;
			} else if (value.startsWith("[") && value.endsWith("]")) {
				// Inline list
				setValueAtPath(result, path, parseInlineList(value));
			} else if (value.startsWith('"') && value.endsWith('"')) {
				// Quoted string
				setValueAtPath(result, path, value.slice(1, -1));
			} else {
				// Plain value
				setValueAtPath(result, path, parseValue(value));
			}
		} else {
			// Handle keys without values (objects)
			let key = line.trim();
			if (key.endsWith(":")) {
				key = key.slice(0, -1).trimEnd();
			}
			path[path.length - 1] = key;
			setValueAtPath(result, path, {});
		}
	}

	return JSON.stringify(result, null, 2);
}

/**
 * Sets a value in an object at the specified path.
 * @param {object} obj - The object to modify.
 * @param {Array} path - An array representing the path to the value.
 * @param {*} value - The value to set.
 */
function setValueAtPath(obj, path, value) {
	let current = obj;
	for (let i = 0; i < path.length - 1; i++) {
		const segment = path[i];
		if (!current[segment]) {
			current[segment] = {};
		}
		current = current[segment];
	}
	current[path[path.length - 1]] = value;
}

/**
 * Retrieves a value from an object at the specified path.
 * @param {object} obj - The object to access.
 * @param {Array} path - An array representing the path to the value.
 * @returns {*} - The value at the specified path, or null if not found.
 */
function getValueAtPath(obj, path) {
	let current = obj;
	for (let segment of path) {
		if (!current[segment]) {
			return undefined;
		}
		current = current[segment];
	}
	return current;
}

/**
 * Parses a YAML value into a JavaScript value.
 * @param {string} value - The value to parse.
 * @returns {*} - The parsed value.
 */
function parseValue(value) {
	if (value === "true") return true;
	if (value === "false") return false;
	if (!isNaN(value)) return Number(value);
	return value;
}

/**
 * Parses an inline YAML list into a JavaScript array.
 * @param {string} listString - The inline list to parse.
 * @returns {Array} - The resulting JavaScript array.
 */
function parseInlineList(listString) {
	return listString
		.slice(1, -1) // Remove brackets
		.split(",") // Split by comma
		.map((item) => item.trim().replace(/^"|"$/g, "")); // Remove quotes and trim
}

// #endregion

// #region JSON to YAML Conversion

/**
 * Converts a JSON object to a YAML string.
 * @param {object} json - The JSON object to convert.
 * @param {number} [indent=0] - The current indentation level.
 * @returns {string} - The resulting YAML string.
 */
export function jsonToYAML(json, indent = 0) {
	let yaml = "";
	const indentation = "  ".repeat(indent);

	for (const key in json) {
		const value = json[key];

		if (typeof value === "object" && !Array.isArray(value) && value !== null) {
			// Handle nested objects
			yaml += `${indentation}${key}:\n`;
			yaml += jsonToYAML(value, indent + 1);
		} else if (Array.isArray(value)) {
			// Handle arrays
			const arrayValues = value.map((item) => (typeof item === "string" ? `"${item}"` : item.toString())).join(", ");
			yaml += `${indentation}${key}: [${arrayValues}]\n`;
		} else {
			// Handle primitive values
			yaml += `${indentation}${key}: ${parseValueToString(value)}\n`;
		}
	}

	return yaml;
}

/**
 * Converts a JavaScript value into a YAML-compatible string.
 * @param {*} value - The value to convert.
 * @returns {string} - The YAML-compatible string representation of the value.
 */
function parseValueToString(value) {
	if (typeof value === "string") return `"${value}"`;
	if (typeof value === "boolean" || typeof value === "number") return value.toString();
	return "";
}

// #endregion
