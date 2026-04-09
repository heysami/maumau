import Foundation

struct ConversationAutomationVapiAssistant: Decodable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String?

    var displayLabel: String {
        let trimmedName = self.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedName.isEmpty ? self.id : trimmedName
    }
}

struct ConversationAutomationVapiPhoneNumber: Decodable, Equatable, Hashable, Identifiable {
    let id: String
    let number: String?
    let name: String?
    let provider: String?
    let phoneCallProvider: String?

    var displayLabel: String {
        let trimmedNumber = self.number?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let trimmedName = self.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let primary = trimmedNumber.isEmpty ? (trimmedName.isEmpty ? self.id : trimmedName) : trimmedNumber
        let normalizedProvider =
            self.phoneCallProvider?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? self.provider?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? ""
        guard !normalizedProvider.isEmpty else { return primary }
        return "\(primary) · \(normalizedProvider)"
    }
}

enum ConversationAutomationVapiClientError: LocalizedError {
    case invalidURL
    case invalidResponse
    case apiError(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid Vapi API URL."
        case .invalidResponse:
            return "Vapi returned an unexpected response."
        case let .apiError(statusCode, message):
            let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? "Vapi returned HTTP \(statusCode)." : "Vapi returned HTTP \(statusCode): \(trimmed)"
        }
    }
}

struct ConversationAutomationVapiClient {
    let apiKey: String
    let baseURL: URL

    init(apiKey: String, baseURL: URL = URL(string: "https://api.vapi.ai")!) {
        self.apiKey = apiKey
        self.baseURL = baseURL
    }

    func listAssistants() async throws -> [ConversationAutomationVapiAssistant] {
        try await self.requestList(
            path: "/assistant",
            candidateKeys: ["assistants", "data", "items"])
    }

    func listPhoneNumbers() async throws -> [ConversationAutomationVapiPhoneNumber] {
        try await self.requestList(
            path: "/phone-number",
            candidateKeys: ["phoneNumbers", "data", "items"])
    }

    private func requestList<T: Decodable>(
        path: String,
        candidateKeys: [String]) async throws -> [T]
    {
        guard let url = URL(string: path, relativeTo: self.baseURL) else {
            throw ConversationAutomationVapiClientError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue("Bearer \(self.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        let session = URLSession(configuration: configuration)
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConversationAutomationVapiClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = Self.extractAPIErrorMessage(from: data)
            throw ConversationAutomationVapiClientError.apiError(httpResponse.statusCode, message)
        }

        return try Self.decodeList(from: data, candidateKeys: candidateKeys)
    }

    private static func decodeList<T: Decodable>(
        from data: Data,
        candidateKeys: [String]) throws -> [T]
    {
        let decoder = JSONDecoder()
        if let direct = try? decoder.decode([T].self, from: data) {
            return direct
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ConversationAutomationVapiClientError.invalidResponse
        }

        for key in candidateKeys {
            guard let value = json[key] else { continue }
            guard JSONSerialization.isValidJSONObject(value) else { continue }
            let nestedData = try JSONSerialization.data(withJSONObject: value)
            if let decoded = try? decoder.decode([T].self, from: nestedData) {
                return decoded
            }
        }

        throw ConversationAutomationVapiClientError.invalidResponse
    }

    private static func extractAPIErrorMessage(from data: Data) -> String {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return String(decoding: data, as: UTF8.self)
        }
        for key in ["message", "error", "status"] {
            if let text = json[key] as? String {
                return text
            }
        }
        return String(decoding: data, as: UTF8.self)
    }
}
