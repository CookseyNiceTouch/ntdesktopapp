export default function MessageContent({content}) {
  if (Array.isArray(content)) {
    return content.map((item, index) => (
      <ContentBlock key={index} block={item} />
    ));
  }
  
  // Legacy string support
  if (typeof content === 'string') {
    return <div className="text-content">{content}</div>;
  }
  
  return null;
}

function ContentBlock({block}) {
  switch(block.type) {
    case 'text':
      return <div className="text-block">{block.text}</div>;
    case 'thinking':
      return <div className="thinking-block">{block.text}</div>;
    case 'image':
      return <img src={block.url} alt={block.alt || 'Image'} className="image-block" />;
    case 'tool_use':
      return <div className="tool-use-block">Using tool: {block.name}</div>;
    default:
      return <div className="unknown-block">{JSON.stringify(block)}</div>;
  }
} 