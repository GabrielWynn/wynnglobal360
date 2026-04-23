'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TestAzurePage() {
  const router = useRouter()
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  async function testConnection() {
    setTesting(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/commission/test-azure')
      const data = await response.json()
      
      if (data.success) {
        setResult(data)
      } else {
        setError(data.message)
      }
    } catch (err: any) {
      setError(`Failed to test: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  async function testLookup() {
    setTesting(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/commission/test-azure-lookup?policy=RS02018475')
      const data = await response.json()
      
      setResult(data)
    } catch (err: any) {
      setError(`Failed to lookup: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-6">Azure SQL Connection Test</h1>
          
          <div className="space-y-4">
            <button
              onClick={testConnection}
              disabled={testing}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Azure Connection'}
            </button>

            <button
              onClick={testLookup}
              disabled={testing}
              className="w-full bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Policy Lookup (RS02018475)'}
            </button>

            <button
              onClick={() => router.push('/commission/admin')}
              className="w-full bg-gray-600 text-white px-6 py-3 rounded-md hover:bg-gray-700"
            >
              Back to Dashboard
            </button>
          </div>

          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              <strong>Error:</strong> {error}
            </div>
          )}

          {result && (
            <div className="mt-6 bg-green-50 border border-green-200 px-4 py-3 rounded">
              <h2 className="font-semibold text-green-800 mb-2">Result:</h2>
              <pre className="text-sm bg-white p-4 rounded overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}