export function extractMetaTag(html: string, property: string): string | null {
    const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["'](.*?)["']`, 'i');
    const match = html.match(regex);
    if (match) return match[1];
    
    const regexAlt = new RegExp(`<meta[^>]*content=["'](.*?)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
    const matchAlt = html.match(regexAlt);
    if (matchAlt) return matchAlt[1];
    
    return null;
}

export function cleanArticleTitle(title: string): string {
    let cleaned = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
    if (cleaned.includes(' - ')) {
        const parts = cleaned.split(' - ');
        parts.pop();
        cleaned = parts.join(' - ');
    }
    return cleaned.trim();
}
