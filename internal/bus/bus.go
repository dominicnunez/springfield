package bus

import (
	"sync"
	"time"
)

type Message struct {
	Type      string
	FromAgent string
	ToAgent   string
	Payload   any
	Timestamp time.Time
}

type MessageHandler func(msg Message)

type Subscription struct {
	id    int
	topic string
}

type MessageBus struct {
	mu            sync.RWMutex
	subscriptions map[string]map[int]MessageHandler
	nextID        int
}

func New() *MessageBus {
	return &MessageBus{
		subscriptions: make(map[string]map[int]MessageHandler),
		nextID:        0,
	}
}

func (b *MessageBus) Publish(topic string, msg Message) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if msg.Timestamp.IsZero() {
		msg.Timestamp = time.Now()
	}

	handlers, ok := b.subscriptions[topic]
	if !ok {
		return
	}

	for _, handler := range handlers {
		go handler(msg)
	}
}

func (b *MessageBus) Subscribe(topic string, handler MessageHandler) Subscription {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.subscriptions[topic] == nil {
		b.subscriptions[topic] = make(map[int]MessageHandler)
	}

	id := b.nextID
	b.nextID++
	b.subscriptions[topic][id] = handler

	return Subscription{id: id, topic: topic}
}

func (b *MessageBus) Unsubscribe(sub Subscription) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if handlers, ok := b.subscriptions[sub.topic]; ok {
		delete(handlers, sub.id)
		if len(handlers) == 0 {
			delete(b.subscriptions, sub.topic)
		}
	}
}

func (b *MessageBus) PublishToAgent(fromAgent, toAgent string, msgType string, payload any) {
	b.Publish(msgType, Message{
		Type:      msgType,
		FromAgent: fromAgent,
		ToAgent:   toAgent,
		Payload:   payload,
		Timestamp: time.Now(),
	})
}

func (b *MessageBus) Broadcast(msgType string, payload any) {
	b.Publish(msgType, Message{
		Type:      msgType,
		Payload:   payload,
		Timestamp: time.Now(),
	})
}
