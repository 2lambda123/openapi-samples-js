/*jslint this: true, browser: true, long: true, bitwise: true */
/*global window console demonstrationHelper */

/**
 * Follows WebSocket behaviour defined by spec:
 * https://html.spec.whatwg.org/multipage/web-sockets.html
 */

(function () {
    // Create a helper function to remove some boilerplate code from the example itself.
    const demo = demonstrationHelper({
        "responseElm": document.getElementById("idResponse"),
        "javaScriptElm": document.getElementById("idJavaScript"),
        "accessTokenElm": document.getElementById("idBearerToken"),
        "retrieveTokenHref": document.getElementById("idHrefRetrieveToken"),
        "tokenValidateButton": document.getElementById("idBtnValidate"),
        "accountsList": document.getElementById("idCbxAccount"),
        "footerElm": document.getElementById("idFooter")
    });
    // These objects contains the state of the subscriptions, so a reconnect can be processed and health can be monitored.
    const tradeMessageSubscription = {
        "reference": "MyTradeMessageEvent",
        "isActive": false,
        "activityMonitor": null,
        "isRecentDataReceived": false
    };
    let connection;

    /**
     * Test if the browser supports the features required for websockets.
     * @return {boolean} True when the features are available.
     */
    function isWebSocketsSupportedByBrowser() {
        return (
            Boolean(window.WebSocket) &&
            Boolean(window.Int8Array) &&
            Boolean(window.Uint8Array) &&
            Boolean(window.TextDecoder)
        );
    }

    /**
     * This is an example of constructing the websocket connection.
     * @return {void}
     */
    function createConnection() {
        const accessToken = document.getElementById("idBearerToken").value;
        const contextId = encodeURIComponent(document.getElementById("idContextId").value);
        const streamerUrl = demo.streamerUrl + "?authorization=" + encodeURIComponent("BEARER " + accessToken) + "&contextId=" + contextId;
        if (!isWebSocketsSupportedByBrowser()) {
            console.error("This browser doesn't support WebSockets.");
            throw "This browser doesn't support WebSockets.";
        }
        if (contextId !== document.getElementById("idContextId").value) {
            console.error("Invalid characters in Context ID.");
            throw "Invalid characters in Context ID.";
        }
        try {
            connection = new window.WebSocket(streamerUrl);
            connection.binaryType = "arraybuffer";
            console.log("Connection created with binaryType '" + connection.binaryType + "'. ReadyState: " + connection.readyState + ".");
            // Documentation on readyState: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
            // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
        } catch (error) {
            console.error("Error creating websocket. " + error);
        }
    }

    /**
     * Mark a message as seen.
     * @param {string} messageId The message to mark as seen
     * @param {Object} titleElement ListItem to be hidden
     * @param {Object} bodyElement ListItem body to be hidden
     * @return {void}
     */
    function markMessageAsSeen(messageId, titleElement, bodyElement) {
        fetch(
            demo.apiUrl + "/trade/v1/messages/seen/" + encodeURIComponent(messageId),
            {
                "method": "PUT",
                "headers": {
                    "Authorization": "Bearer " + document.getElementById("idBearerToken").value
                }
            }
        ).then(function (response) {
            if (response.ok) {
                // Remove message from the list:
                bodyElement.remove();
                titleElement.remove();
                // No response, just mention the successful response..
                console.log("Message marked as 'seen': " + messageId);
            } else {
                demo.processError(response);
            }
        }).catch(function (error) {
            console.error(error);
        });
    }

    /**
     * Add the trade messages to a listbox.
     * @param {Object} tradeMessages The snapshot from the response, or the incoming trade messages
     * @return {void}
     */
    function handleTradeMessages(tradeMessages) {
        const list = document.getElementById("idTradeMessages");
        tradeMessages.forEach(function (tradeMessage) {
            const titleElement = document.createElement("DT");
            const bodyElement = document.createElement("DD");
            const buttonElement = document.createElement("BUTTON");
            let headerText = tradeMessage.MessageHeader;
            let bodyText = tradeMessage.MessageBody + "\n" + new Date(tradeMessage.DateTime).toLocaleString() + "\n";
            switch (tradeMessage.MessageType) {
            case "AccountDepreciation":
                // Message to indicate that an account has depreciated beyond a limit as specified by MIFID II regulations.
                // Only sent for configured client segments.
                // MessageBody is empty:
                bodyText = "Account deprecation for account " + tradeMessage.AccountId + ": " + tradeMessage.DepreciationPct + "%, starting @ " + new Date(tradeMessage.ReportingPeriodStart).toLocaleString();
                break;
            case "MarginCall":
                // A margin call is a message informing the client about loses affecting his ability fulfill the margin requirements of his positions in the market.
                break;
            case "Notification":
                // Message from broker to end client.
                break;
            case "PositionDepreciation":
                // Message to indicate that a position has depreciated beyond a limit as specified by MIFID II regulations.
                // Only sent for configured client segments.
                // MessageBody is empty:
                bodyText = "Position deprecation for account " + tradeMessage.AccountId + ": " + tradeMessage.DepreciationPct + "%, instrument " + tradeMessage.DisplayAndFormat.Description;
                break;
            case "PriceAlert":
                // A price alert has been triggered.
                headerText += " (instrument " + tradeMessage.DisplayAndFormat.Description + ")";
                break;
            case "TradeConfirmation":
                // A very broad set of notifications related to orders and positions. For example:
                // - An order has been placed
                // - An order has expired
                // - An order has been (partially) filled
                // - An order was cancelled
                // - A position was stopped out (due to insufficient margin)
                // - A position was placed
                break;
            case "Mifid":  // A change has been made to the clients Mifid classification. Only sent for configured client segments.
            case "ShareWorkspaceNotification":  // Platform Workspace Notification: Share workspace notification.
                // Added to make the sample complete, but these messages can be ignored by thirdparty applications!
                break;
            default:
                console.error("Unknown MessageType received: " + tradeMessage.MessageType);
            }
            titleElement.appendChild(document.createTextNode(headerText));
            list.appendChild(titleElement);
            bodyElement.appendChild(document.createTextNode(bodyText));
            buttonElement.innerText = "Mark message as 'seen'";
            buttonElement.onclick = function () {
                markMessageAsSeen(tradeMessage.MessageId, titleElement, bodyElement);
                demo.displaySourceCode([markMessageAsSeen]);
            };
            bodyElement.appendChild(buttonElement);
            list.appendChild(bodyElement);
            if (tradeMessage.hasOwnProperty("DisplayType") && tradeMessage.DisplayType === "Popup") {
                // This message requires immediate attention..
                window.alert(tradeMessage.MessageBody);
            }
        });
    }

    /**
     * This function retrieves the trade messages that are not marked as seen.
     * There is no real need to use this endpoint when you setup a subscription, because the messages are also
     * available as snapshot in the response of the subscription request.
     * @returns {void}
     */
    function getTradeMessages() {
        fetch(
            demo.apiUrl + "/trade/v1/messages",
            {
                "method": "GET",
                "headers": {
                    "Authorization": "Bearer " + document.getElementById("idBearerToken").value
                }
            }
        ).then(function (response) {
            if (response.ok) {
                response.json().then(function (responseJson) {
                    if (responseJson.length > 0) {
                        handleTradeMessages(responseJson);
                    } else {
                        window.alert("No messages to show.");
                    }
                    console.log("Trade messages: " + JSON.stringify(responseJson, null, 4) + "\n\nThis response will also be returned as snapshot in the response of the subscription request.");
                });
            } else {
                demo.processError(response);
            }
        }).catch(function (error) {
            console.error(error);
        });
    }

    /**
     * This function monitors the data going over the network for the different active subscriptions.
     * @param {Object} subscription The subscription to monitor
     * @returns {void}
     */
    function monitorActivity(subscription) {
        if (subscription.isActive) {
            if (subscription.isRecentDataReceived) {
                console.debug("Subscription " + subscription.reference + " is healthy..");
                subscription.isRecentDataReceived = false;
            } else {
                console.error("No recent network activity for subscription " + subscription.reference + ". You might want to reconnect.");
            }
        }
    }

    /**
     * This is an example of subscribing to trade messages.
     * @return {void}
     */
    function subscribeTradeMessages() {
        const data = {
            "ContextId": document.getElementById("idContextId").value,
            "ReferenceId": tradeMessageSubscription.reference
        };
        fetch(
            demo.apiUrl + "/trade/v1/messages/subscriptions",
            {
                "method": "POST",
                "headers": {
                    "Authorization": "Bearer " + document.getElementById("idBearerToken").value,
                    "Content-Type": "application/json; charset=utf-8"
                },
                "body": JSON.stringify(data)
            }
        ).then(function (response) {
            if (response.ok) {
                tradeMessageSubscription.isRecentDataReceived = true;  // Start positive, will be set to 'false' after the next monitor health check.
                tradeMessageSubscription.isActive = true;
                response.json().then(function (responseJson) {
                    // Monitor connection every "InactivityTimeout" seconds.
                    if (tradeMessageSubscription.activityMonitor === null) {
                        tradeMessageSubscription.activityMonitor = window.setInterval(function () {
                            monitorActivity(tradeMessageSubscription);
                        }, responseJson.InactivityTimeout * 1000);
                    }
                    if (responseJson.Snapshot.Data.length > 0) {
                        handleTradeMessages(responseJson.Snapshot.Data);
                    } else {
                        window.alert("No messages to show, but listening to new messages.");
                    }
                    console.log("Subscription for trade messages created with readyState " + connection.readyState + " and data: " + JSON.stringify(data, null, 4) + "\n\nResponse: " + JSON.stringify(responseJson, null, 4));
                });
            } else {
                demo.processError(response);
            }
        }).catch(function (error) {
            console.error(error);
        });
    }

    /**
     * This is an example of unsubscribing to the events.
     * @param {Function} callbackOnSuccess Function to invoke on success
     * @return {void}
     */
    function unsubscribe(callbackOnSuccess) {

        /**
         * Unsubscribe for the service added to the URL.
         * @param {boolean} isSubscriptionActive When not active, skip and invoke callback
         * @param {string} urlPath The URL pointing to the service to unsubscribe
         * @param {Function} internalCallbackOnSuccess Function to invoke on success
         * @return {void}
         */
        function removeSubscription(isSubscriptionActive, urlPath, internalCallbackOnSuccess) {
            if (isSubscriptionActive) {
                fetch(
                    demo.apiUrl + urlPath,
                    {
                        "method": "DELETE",
                        "headers": {
                            "Authorization": "Bearer " + document.getElementById("idBearerToken").value
                        }
                    }
                ).then(function (response) {
                    if (response.ok) {
                        console.log("Unsubscribed to " + urlPath + ".\nReadyState " + connection.readyState + ".");
                        internalCallbackOnSuccess();
                    } else {
                        demo.processError(response);
                    }
                }).catch(function (error) {
                    console.error(error);
                });
            } else {
                internalCallbackOnSuccess();
            }
        }

        const contextId = document.getElementById("idContextId").value;
        const urlPathTradeMessages = "/trade/v1/messages/subscriptions/" + encodeURIComponent(contextId);
        removeSubscription(tradeMessageSubscription.isActive, urlPathTradeMessages, callbackOnSuccess);
    }

    /**
     * Unsubscribe and subscribe again, with the selected/active account.
     * @return {void}
     */
    function recreateSubscriptions() {
        unsubscribe(function () {
            if (tradeMessageSubscription.isActive) {
                subscribeTradeMessages();
            }
        });
    }

    /**
     * This function initiates the events and contains the processing of new messages.
     * @return {void}
     */
    function startListener() {
        const utf8Decoder = new window.TextDecoder();

        /**
         * This event is triggered when the socket connection is opened.
         * @return {void}
         */
        function handleSocketOpen() {
            console.log("Streaming connected.");
        }

        /**
         * This event is triggered when the socket connection is closed.
         * @param {Object} evt The event containing the reason
         * @return {void}
         */
        function handleSocketClose(evt) {
            // Status codes: https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
            if (evt.wasClean === true) {
                console.log("Streaming disconnected with code " + evt.code + ".");  // Most likely 1000 (Normal Closure), or 1001 (Going Away)
            } else {
                console.error("Streaming disconnected with code " + evt.code + ".");
                if (demo.getSecondsUntilTokenExpiry(document.getElementById("idBearerToken").value) <= 0) {
                    window.alert("It looks like the socket has been disconnected due to an expired token (error code " + evt.code + ").");
                } else if (window.confirm("It looks like the socket has been disconnected, probably due to a network failure (error code " + evt.code + ").\nDo you want to (try to) reconnect?")) {
                    createConnection();
                    startListener();
                    // Ideally you create a setup where the connection is restored automatically, after a second or so.
                    // You can do this with an increasing wait time, until a maximum of say 10 retries.
                    recreateSubscriptions();
                }
            }
        }

        /**
         * This event is triggered when the socket connection enters an error state.
         * @param {Object} evt The event containing the reason
         * @return {void}
         */
        function handleSocketError(evt) {
            console.error(evt);
        }

        /**
         * This function processes the heartbeat messages, containing info about system health.
         * https://www.developer.saxo/openapi/learn/plain-websocket-streaming#PlainWebSocketStreaming-Controlmessages
         * @param {Array<Object>} payload The list of messages
         * @return {void}
         */
        function handleHeartbeat(payload) {
            // Heartbeat messages are sent every 20 seconds. If there is a minute without messages, this is an error.
            if (Array.isArray(payload)) {
                payload.forEach(function (heartbeatMessages) {
                    heartbeatMessages.Heartbeats.forEach(function (heartbeat) {
                        switch (heartbeat.Reason) {
                        case "SubscriptionTemporarilyDisabled":
                        case "SubscriptionPermanentlyDisabled":
                            console.error("Heartbeat event error: " + heartbeat.Reason);
                            break;
                        case "NoNewData":
                            switch (heartbeat.OriginatingReferenceId) {
                            case tradeMessageSubscription.reference:
                                tradeMessageSubscription.isRecentDataReceived = true;
                                break;
                            }
                            console.debug("No data, but heartbeat received for " + heartbeat.OriginatingReferenceId + " @ " + new Date().toLocaleTimeString());
                            break;
                        default:
                            console.error("Unknown heartbeat message received: " + JSON.stringify(payload));
                        }
                    });
                });
            } else {
                // This might be a TradeLevelChange event
                console.log("Received non-array heartbeat notification: " + JSON.stringify(payload, null, 4));
            }
        }

        /**
         * Creates a Long from its little endian byte representation (function is part of long.js - https://github.com/dcodeIO/long.js).
         * @param {!Array.<number>} bytes Little endian byte representation
         * @param {boolean=} unsigned Whether unsigned or not, defaults to signed
         * @returns {number} The corresponding Long value
         */
        function fromBytesLe(bytes, unsigned) {
            const low = (bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24) | 0;
            const high = (bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24) | 0;
            const twoPwr16Dbl = 1 << 16;
            const twoPwr32Dbl = twoPwr16Dbl * twoPwr16Dbl;
            if (unsigned) {
                return (high >>> 0) * twoPwr32Dbl + (low >>> 0);
            }
            return high * twoPwr32Dbl + (low >>> 0);
        }

        /**
         * Parse the incoming messages. Documentation on message format: https://www.developer.saxo/openapi/learn/plain-websocket-streaming#PlainWebSocketStreaming-Receivingmessages
         * @param {Object} data The received stream message
         * @returns {Array.<Object>} Returns an array with all incoming messages of the frame
         */
        function parseMessageFrame(data) {
            const message = new DataView(data);
            const parsedMessages = [];
            let index = 0;
            let messageId;
            let referenceIdSize;
            let referenceIdBuffer;
            let referenceId;
            let payloadFormat;
            let payloadSize;
            let payloadBuffer;
            let payload;
            while (index < data.byteLength) {
                /* Message identifier (8 bytes)
                 * 64-bit little-endian unsigned integer identifying the message.
                 * The message identifier is used by clients when reconnecting. It may not be a sequence number and no interpretation
                 * of its meaning should be attempted at the client.
                 */
                messageId = fromBytesLe(new window.Uint8Array(data, index, 8));
                index += 8;
                /* Version number (2 bytes)
                 * Ignored in this example. Get it using 'messageEnvelopeVersion = message.getInt16(index)'.
                 */
                index += 2;
                /* Reference id size 'Srefid' (1 byte)
                 * The number of characters/bytes in the reference id that follows.
                 */
                referenceIdSize = message.getInt8(index);
                index += 1;
                /* Reference id (Srefid bytes)
                 * ASCII encoded reference id for identifying the subscription associated with the message.
                 * The reference id identifies the source subscription, or type of control message (like '_heartbeat').
                 */
                referenceIdBuffer = new window.Int8Array(data, index, referenceIdSize);
                referenceId = String.fromCharCode.apply(String, referenceIdBuffer);
                index += referenceIdSize;
                /* Payload format (1 byte)
                 * 8-bit unsigned integer identifying the format of the message payload. Currently the following formats are defined:
                 *  0: The payload is a UTF-8 encoded text string containing JSON.
                 *  1: The payload is a binary protobuffer message.
                 * The format is selected when the client sets up a streaming subscription so the streaming connection may deliver a mixture of message format.
                 * Control messages such as subscription resets are not bound to a specific subscription and are always sent in JSON format.
                 */
                payloadFormat = message.getUint8(index);
                index += 1;
                /* Payload size 'Spayload' (4 bytes)
                 * 64-bit little-endian unsigned integer indicating the size of the message payload.
                 */
                payloadSize = message.getUint32(index, true);
                index += 4;
                /* Payload (Spayload bytes)
                 * Binary message payload with the size indicated by the payload size field.
                 * The interpretation of the payload depends on the message format field.
                 */
                payloadBuffer = new window.Uint8Array(data, index, payloadSize);
                payload = null;
                switch (payloadFormat) {
                case 0:
                    // JSON
                    try {
                        payload = JSON.parse(utf8Decoder.decode(payloadBuffer));
                    } catch (error) {
                        console.error(error);
                    }
                    break;
                case 1:
                    // ProtoBuf is not supported in this example. See the realtime-quotes example for a Protocol Buffers implementation.
                    console.error("Protocol Buffers are not supported in this example.");
                    break;
                default:
                    console.error("Unsupported payloadFormat: " + payloadFormat);
                }
                if (payload !== null) {
                    parsedMessages.push({
                        "messageId": messageId,
                        "referenceId": referenceId,
                        "payload": payload
                    });
                }
                index += payloadSize;
            }
            return parsedMessages;
        }

        /**
         * New data is received. Read and process the data.
         * @param {Object} messageFrame The received message
         * @return {void}
         */
        function handleSocketMessage(messageFrame) {
            const messages = parseMessageFrame(messageFrame.data);
            messages.forEach(function (message) {
                switch (message.referenceId) {
                case tradeMessageSubscription.reference:
                    tradeMessageSubscription.isRecentDataReceived = true;
                    handleTradeMessages(message.payload);
                    demo.displaySourceCode([handleTradeMessages]);
                    console.log("Streaming trade message(s) " + message.messageId + " received: " + JSON.stringify(message.payload, null, 4));
                    break;
                case "_heartbeat":
                    // https://www.developer.saxo/openapi/learn/plain-websocket-streaming#PlainWebSocketStreaming-Controlmessages
                    handleHeartbeat(message.payload);
                    break;
                case "_resetsubscriptions":
                    // https://www.developer.saxo/openapi/learn/plain-websocket-streaming#PlainWebSocketStreaming-Controlmessages
                    // The server is not able to send messages and client needs to reset subscriptions by recreating them.
                    console.error("Reset Subscription Control message received! Reset your subscriptions by recreating them.\n\n" + JSON.stringify(message.payload, null, 4));
                    recreateSubscriptions();  // When the TargetReferenceIds array contains elements, this can be done in a more efficient way, by only resubscribing to the referenced subscriptions.
                    break;
                case "_disconnect":
                    // https://www.developer.saxo/openapi/learn/plain-websocket-streaming#PlainWebSocketStreaming-Controlmessages
                    // The server has disconnected the client. This messages requires you to re-authenticate if you wish to continue receiving messages.
                    console.error("The server has disconnected the client! New login is required.\n\n" + JSON.stringify(message.payload, null, 4));
                    break;
                default:
                    console.error("No processing implemented for message with reference " + message.referenceId);
                }
            });
        }

        connection.onopen = handleSocketOpen;
        connection.onclose = handleSocketClose;
        connection.onerror = handleSocketError;
        connection.onmessage = handleSocketMessage;
        console.log("Connection subscribed to events. ReadyState: " + connection.readyState + ".");
    }

    /**
     * This is an example of extending the websocket session, when a token refresh took place.
     * @return {void}
     */
    function extendSubscription() {
        fetch(
            demo.apiUrl + "/streamingws/authorize?contextid=" + encodeURIComponent(document.getElementById("idContextId").value),
            {
                "method": "PUT",
                "headers": {
                    "Authorization": "Bearer " + document.getElementById("idBearerToken").value
                }
            }
        ).then(function (response) {
            if (response.ok) {
                console.log("Subscription extended.");
            } else {
                demo.processError(response);
            }
        }).catch(function (error) {
            console.error(error);
        });
    }

    /**
     * This is an example of unsubscribing, including a reset of the state.
     * @return {void}
     */
    function unsubscribeAndResetState() {
        unsubscribe(function () {
            tradeMessageSubscription.isActive = false;
        });
    }

    /**
     * This is an example of disconnecting.
     * @return {void}
     */
    function disconnect() {
        const NORMAL_CLOSURE = 1000;
        connection.close(NORMAL_CLOSURE);  // This will trigger the onclose event
        // Activity monitoring can be stopped.
        window.clearInterval(tradeMessageSubscription.activityMonitor);
    }

    document.getElementById("idContextId").value = "MyApp_" + Date.now();  // Some unique value
    demo.setupEvents([
        {"evt": "click", "elmId": "idBtnGetTradeMessages", "func": getTradeMessages, "funcsToDisplay": [getTradeMessages]},
        {"evt": "click", "elmId": "idBtnCreateConnection", "func": createConnection, "funcsToDisplay": [createConnection]},
        {"evt": "click", "elmId": "idBtnStartListener", "func": startListener, "funcsToDisplay": [startListener]},
        {"evt": "click", "elmId": "idBtnSubscribeTradeMessages", "func": subscribeTradeMessages, "funcsToDisplay": [subscribeTradeMessages]},
        {"evt": "click", "elmId": "idBtnExtendSubscription", "func": extendSubscription, "funcsToDisplay": [extendSubscription]},
        {"evt": "click", "elmId": "idBtnUnsubscribe", "func": unsubscribeAndResetState, "funcsToDisplay": [unsubscribeAndResetState]},
        {"evt": "click", "elmId": "idBtnDisconnect", "func": disconnect, "funcsToDisplay": [disconnect]}
    ]);
    demo.displayVersion("trade");
}());
