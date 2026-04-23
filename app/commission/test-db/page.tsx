'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TestDatabase() {
  const [results, setResults] = useState<any>({
    connection: 'Testing...',
    ifas: null,
    platforms: null,
    commissionTypes: null,
    policies: null,
    user: null,
    errors: []
  })

  useEffect(() => {
    testConnection()
  }, [])

  async function testConnection() {
    const testResults: any = {
      connection: 'Unknown',
      ifas: null,
      platforms: null,
      commissionTypes: null,
      policies: null,
      user: null,
      errors: []
    }

    try {
      // Test 1: Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) {
        testResults.errors.push(`User Error: ${userError.message}`)
      } else {
        testResults.user = user
        testResults.connection = user ? 'Connected ✓' : 'Not logged in'
      }

      // Test 2: Count IFAs
      const { count: ifaCount, error: ifaError } = await supabase
        .from('ifas')
        .select('*', { count: 'exact', head: true })
      
      if (ifaError) {
        testResults.errors.push(`IFAs Error: ${ifaError.message}`)
      } else {
        testResults.ifas = `${ifaCount} IFAs found ✓`
      }

      // Test 3: Count Platforms
      const { count: platformCount, error: platformError } = await supabase
        .from('platforms')
        .select('*', { count: 'exact', head: true })
      
      if (platformError) {
        testResults.errors.push(`Platforms Error: ${platformError.message}`)
      } else {
        testResults.platforms = `${platformCount} platforms found ✓`
      }

      // Test 4: Count Commission Types
      const { count: typeCount, error: typeError } = await supabase
        .from('commission_types')
        .select('*', { count: 'exact', head: true })
      
      if (typeError) {
        testResults.errors.push(`Commission Types Error: ${typeError.message}`)
      } else {
        testResults.commissionTypes = `${typeCount} commission types found ✓`
      }

      // Test 5: Count Policies
      const { count: policyCount, error: policyError } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
      
      if (policyError) {
        testResults.errors.push(`Policies Error: ${policyError.message}`)
      } else {
        testResults.policies = `${policyCount} policies found ✓`
      }

      // Test 6: Try to fetch actual data
      const { data: platformData, error: platformDataError } = await supabase
        .from('platforms')
        .select('code, name')
        .limit(5)
      
      if (platformDataError) {
        testResults.errors.push(`Platform Data Error: ${platformDataError.message}`)
      } else {
        testResults.platformSample = platformData
      }

    } catch (error: any) {
      testResults.errors.push(`General Error: ${error.message}`)
    }

    setResults(testResults)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-6">Supabase Connection Test</h1>

          {/* Connection Status */}
          <div className="mb-6 p-4 bg-blue-50 rounded">
            <h2 className="font-semibold mb-2">Connection Status:</h2>
            <p className="text-lg">{results.connection}</p>
          </div>

          {/* User Info */}
          {results.user && (
            <div className="mb-6 p-4 bg-green-50 rounded">
              <h2 className="font-semibold mb-2">Current User:</h2>
              <p>Email: {results.user.email}</p>
              <p>Role: {results.user.user_metadata?.role || 'Not set'}</p>
              <p>Name: {results.user.user_metadata?.name || 'Not set'}</p>
            </div>
          )}

          {/* Database Counts */}
          <div className="mb-6 p-4 bg-gray-50 rounded">
            <h2 className="font-semibold mb-2">Database Tables:</h2>
            <ul className="space-y-1">
              <li>{results.ifas || 'Testing IFAs...'}</li>
              <li>{results.platforms || 'Testing Platforms...'}</li>
              <li>{results.commissionTypes || 'Testing Commission Types...'}</li>
              <li>{results.policies || 'Testing Policies...'}</li>
            </ul>
          </div>

          {/* Sample Platform Data */}
          {results.platformSample && (
            <div className="mb-6 p-4 bg-purple-50 rounded">
              <h2 className="font-semibold mb-2">Sample Platform Data:</h2>
              <pre className="text-sm bg-white p-2 rounded overflow-auto">
                {JSON.stringify(results.platformSample, null, 2)}
              </pre>
            </div>
          )}

          {/* Errors */}
          {results.errors.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 rounded border border-red-200">
              <h2 className="font-semibold mb-2 text-red-800">Errors Found:</h2>
              <ul className="space-y-1 text-red-700">
                {results.errors.map((error: string, index: number) => (
                  <li key={index} className="text-sm">• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Environment Check */}
          <div className="mb-6 p-4 bg-yellow-50 rounded">
            <h2 className="font-semibold mb-2">Environment Variables:</h2>
            <p className="text-sm">
              Supabase URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing'}
            </p>
            <p className="text-sm">
              Supabase Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing'}
            </p>
            {process.env.NEXT_PUBLIC_SUPABASE_URL && (
              <p className="text-xs mt-2 text-gray-600">
                URL: {process.env.NEXT_PUBLIC_SUPABASE_URL}
              </p>
            )}
          </div>

          <button
            onClick={testConnection}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Re-run Tests
          </button>
        </div>
      </div>
    </div>
  )
}