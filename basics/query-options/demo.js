/*jslint this: true, browser: true, for: true, long: true */
/*global window console user run processError apiUrl displayVersion */

const firstUrl = apiUrl + "/ref/v1/exchanges?$top=30";
let nextUrl = firstUrl;

/**
 * Request the next page of a long Data collection.
 * @return {void}
 */
function getNext() {
    fetch(
        nextUrl,
        {
            "method": "GET",
            "headers": {
                "Authorization": "Bearer " + document.getElementById("idBearerToken").value
            }
        }
    ).then(function (response) {
        if (response.ok) {
            response.json().then(function (responseJson) {
                let i;
                for (i = 0; i < responseJson.Data.length; i += 1) {
                    responseJson.Data[i] = {
                        "ExchangeId": responseJson.Data[i].ExchangeId  // For simplicity, make the response smaller
                    };
                }
                console.log("Found " + responseJson.Data.length + " elements using URL\n" + nextUrl + ":\n\n" + JSON.stringify(responseJson, null, 4));
                if (responseJson.hasOwnProperty("__next")) {
                    nextUrl = responseJson.__next;
                } else {
                    window.alert("This is the last block of elements. You've requested them all.");
                }
            });
        } else {
            processError(response);
        }
    }).catch(function (error) {
        console.error(error);
    });
}

/**
 * Request the first page of a long Data collection.
 * @return {void}
 */
function getFirst() {
    nextUrl = firstUrl;  // Init with 'first' URL
    getNext();
}

(function () {
    document.getElementById("idBtnGetFirst").addEventListener("click", function () {
        run(getFirst, getNext);
    });
    document.getElementById("idBtnGetNext").addEventListener("click", function () {
        run(getNext);
    });
    displayVersion("ref");
}());
