package uds

import (
	"encoding/json"
	"fmt"
	"sync/atomic"
)

var reqCounter atomic.Uint64

// MsgType identifies the kind of message.
type MsgType string

const (
	MsgTypeReq MsgType = "req"
	MsgTypeRes MsgType = "res"
	MsgTypeEvt MsgType = "evt"
)

// Message is the NDJSON envelope for all communication.
type Message struct {
	Type   MsgType         `json:"type"`
	ID     string          `json:"id"`
	Method string          `json:"method"`
	Data   json.RawMessage `json:"data,omitempty"`
	Error  string          `json:"error,omitempty"`
}

// NewRequest creates a new request message with a unique ID.
func NewRequest(method string, data any) (Message, error) {
	id := fmt.Sprintf("req-%d", reqCounter.Add(1))
	var raw json.RawMessage
	if data != nil {
		b, err := json.Marshal(data)
		if err != nil {
			return Message{}, err
		}
		raw = b
	}
	return Message{
		Type:   MsgTypeReq,
		ID:     id,
		Method: method,
		Data:   raw,
	}, nil
}

// NewResponse creates a response to a request.
func NewResponse(reqID, method string, data any) (Message, error) {
	var raw json.RawMessage
	if data != nil {
		b, err := json.Marshal(data)
		if err != nil {
			return Message{}, err
		}
		raw = b
	}
	return Message{
		Type:   MsgTypeRes,
		ID:     reqID,
		Method: method,
		Data:   raw,
	}, nil
}

// NewErrorResponse creates an error response.
func NewErrorResponse(reqID, method, errMsg string) Message {
	return Message{
		Type:   MsgTypeRes,
		ID:     reqID,
		Method: method,
		Error:  errMsg,
	}
}

// NewEvent creates a server-pushed event.
func NewEvent(method string, data any) (Message, error) {
	id := fmt.Sprintf("evt-%d", reqCounter.Add(1))
	var raw json.RawMessage
	if data != nil {
		b, err := json.Marshal(data)
		if err != nil {
			return Message{}, err
		}
		raw = b
	}
	return Message{
		Type:   MsgTypeEvt,
		ID:     id,
		Method: method,
		Data:   raw,
	}, nil
}

// Methods
const (
	MethodPing             = "Ping"
	MethodLoadManifest     = "LoadManifest"
	MethodListItems        = "ListItems"
	MethodGetItem          = "GetItem"
	MethodAction           = "Action"
	MethodLogsSubscribe    = "LogsSubscribe"
	MethodLogsUnsubscribe  = "LogsUnsubscribe"
	MethodUpdateManifest   = "UpdateManifest"

	EventItemsDelta = "items.delta"
	EventLogsLine   = "logs.line"
)

// PingResponse is the response to a Ping request.
type PingResponse struct {
	Pong bool `json:"pong"`
}

// ActionRequest is the payload for an Action request.
type ActionRequest struct {
	ItemID string `json:"item_id"`
	Action string `json:"action"` // start, stop, restart, term, kill
}
